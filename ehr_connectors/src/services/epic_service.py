import httpx
import base64
import logging
import uuid
from datetime import datetime, timezone
from src.config import get_settings

import jwt  # PyJWT

logger = logging.getLogger(__name__)


class EpicService:
    def __init__(self):
        self.settings = get_settings()
        self.client = httpx.AsyncClient(base_url=self.settings.EPIC_FHIR_BASE_URL)

    def _generate_client_jwt(self) -> str:
        """
        Generate a signed JWT for Epic's private_key_jwt client authentication.

        Per Epic's SMART Backend Services (Backend OAuth 2.0) spec:
          - alg: RS384
          - Header:  { alg, typ, kid }
          - Payload: { iss, sub, aud, jti, iat, nbf, exp }

        https://fhir.epic.com/Documentation?docId=oauth2tutorial&section=cloud-based-app
        """
        now = int(datetime.now(tz=timezone.utc).timestamp())
        payload = {
            "iss": self.settings.EPIC_CLIENT_ID,
            "sub": self.settings.EPIC_CLIENT_ID,
            "aud": self.settings.EPIC_TOKEN_URL,
            "jti": str(uuid.uuid4()),
            "iat": now,
            "nbf": now,
            "exp": now + 300,  # 5 minutes; Epic max is 5 min
        }
        headers = {
            "alg": "RS384",
            "typ": "JWT",
            "kid": self.settings.EPIC_KID,
        }
        import codecs
        private_key_pem = codecs.decode(
            self.settings.EPIC_PRIVATE_KEY, "unicode_escape"
        )

        logger.debug(f"Creating JWT for client_id={self.settings.EPIC_CLIENT_ID}, kid={self.settings.EPIC_KID}")

        token = jwt.encode(
            payload,
            private_key_pem,
            algorithm="RS384",
            headers=headers,
        )
        return token

    async def get_access_token(self) -> dict:
        """
        Request an access token from Epic using private_key_jwt authentication
        (SMART Backend Services / Backend OAuth 2.0 flow).
        """
        client_assertion = self._generate_client_jwt()

        payload = {
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": client_assertion,
            # Explicitly request the general DocumentReference create scope
            "scope": "system/DocumentReference.c system/Patient.r system/Patient.s",
        }

        logger.info(f"Requesting access token from {self.settings.EPIC_TOKEN_URL} (private_key_jwt)")

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.settings.EPIC_TOKEN_URL,
                    data=payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if response.status_code != 200:
                    logger.error(
                        f"Failed to get access token: HTTP {response.status_code} — {response.text}"
                    )
                response.raise_for_status()
                data = response.json()
                logger.info(
                    f"Successfully obtained access token (expires_in={data.get('expires_in')}s, "
                    f"scope={data.get('scope')})"
                )
                return data
            except httpx.HTTPStatusError as e:
                logger.error(
                    f"HTTP error during token request: {e.response.status_code} — {e.response.text}"
                )
                raise
            except Exception as e:
                logger.error(f"Unexpected error during token request: {str(e)}")
                raise

    async def get_latest_encounter(self, patient_id: str, token: str) -> str:
        """Fetch the most recent encounter ID for the patient (Helper/Optional)."""
        logger.info(f"Fetching an Encounter for patient {patient_id}...")
        try:
            response = await self.client.get(
                f"/Encounter?patient={patient_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/fhir+json",
                },
            )
            response.raise_for_status()
            data = response.json()

            # Epic returns a Bundle. Extract the first Encounter ID.
            if data.get("resourceType") == "Bundle" and "entry" in data:
                for entry in data.get("entry", []):
                    res = entry.get("resource", {})
                    if res.get("resourceType") == "Encounter":
                        encounter_id = res.get("id")
                        logger.info(f"Successfully found Encounter: {encounter_id}")
                        return encounter_id

            logger.warning(f"Could not find any encounters for patient {patient_id}.")
            return None
        except Exception as e:
            logger.error(f"Error fetching encounter: {str(e)}")
            return None

    async def send_approval_status(
        self, patient_id: str, consent_text: str, approved_at: str = None
    ):
        """
        Send a general DocumentReference (Patient Media / Consent) to Epic.
        No Encounter context needed with explicit scope authorization.
        """
        if not approved_at:
            approved_at = datetime.now(tz=timezone.utc).isoformat()

        token_data = await self.get_access_token()
        token = token_data["access_token"]

        # Build the exact payload for a general patient consent
        document_reference = {
            "resourceType": "DocumentReference",
            "status": "current",
            "docStatus": "final",
            "type": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "34133-9",
                        "display": "Summary of episode note",
                    }
                ],
                "text": "Patient Consent Form",
            },
            # THIS BLOCK IS THE KEY TO FIXING THE 403 ERROR:
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category",
                            "code": "reference",  # FORCE it to 'reference', NOT 'clinical-note'
                            "display": "Reference",
                        }
                    ]
                }
            ],
            "subject": {"reference": f"Patient/{patient_id}"},
            "author": [
                {
                    "reference": "Practitioner/eSo9eP0mV3eFB3pTR6e53jQ3",
                    "display": "Ambulatory, James",
                }
            ],
            "date": approved_at,
            "content": [
                {
                    "attachment": {
                        "contentType": "text/plain",
                        "data": base64.b64encode(consent_text.encode()).decode(),
                        "title": "Patient Consent Form",
                    }
                }
            ],
        }

        logger.info(f"Sending Encounter-less Consent Document to Epic for patient {patient_id}")
        try:
            response = await self.client.post(
                "/DocumentReference",
                json=document_reference,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/fhir+json",
                },
            )

            if response.status_code not in (200, 201):
                logger.error(
                    f"Failed to send DocumentReference: HTTP {response.status_code} — {response.text}"
                )

            response.raise_for_status()
            logger.info(
                f"Successfully posted DocumentReference for patient {patient_id}"
            )
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(
                f"HTTP error sending DocumentReference: {e.response.status_code} — {e.response.text}"
            )
            raise
        except Exception as e:
            logger.error(f"Unexpected error sending DocumentReference: {str(e)}")
            raise
