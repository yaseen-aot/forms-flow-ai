import httpx
import base64
from datetime import datetime
from src.config import get_settings

class EpicService:
    def __init__(self):
        self.settings = get_settings()
        self.client = httpx.AsyncClient(base_url=self.settings.EPIC_FHIR_BASE_URL)

    async def get_access_token(self):
        """
        Request an access token from Epic using Client Credentials flow.
        Note: Epic typically uses JWT-based client authentication.
        This is a simplified version; in production, you might need to sign a JWT.
        """
        # For simplicity, using basic auth or form data as a placeholder
        # Real Epic integration often requires a signed JWT
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.settings.EPIC_CLIENT_ID,
            "client_secret": self.settings.EPIC_CLIENT_SECRET,
            "scope": "patient/*.read patient/*.write"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(self.settings.EPIC_TOKEN_URL, data=payload)
            response.raise_for_status()
            data = response.json()
            return data["access_token"]

    async def send_approval_status(self, patient_id: str, consent_text: str, approved_at: str = None):
        """
        Send a DocumentReference resource to Epic to indicate approval.
        """
        if not approved_at:
            approved_at = datetime.utcnow().isoformat() + "Z"

        token = await self.get_access_token()
        
        document_reference = {
            "resourceType": "DocumentReference",
            "status": "current",
            "type": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "59284-0",
                        "display": "Consent"
                    }
                ]
            },
            "subject": {
                "reference": f"Patient/{patient_id}"
            },
            "date": approved_at,
            "content": [
                {
                    "attachment": {
                        "contentType": "text/plain",
                        "data": base64.b64encode(consent_text.encode()).decode(),
                        "title": "Patient Consent Form"
                    }
                }
            ]
        }

        response = await self.client.post(
            "/DocumentReference",
            json=document_reference,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/fhir+json"
            }
        )
        response.raise_for_status()
        return response.json()
