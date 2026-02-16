import pytest
import respx
import httpx
from fastapi.testclient import TestClient
from src.main import app
from src.config import get_settings

client = TestClient(app)

@respx.mock
@pytest.mark.asyncio
async def test_approve_to_epic_success():
    settings = get_settings()
    
    # Mock token request
    token_route = respx.post(settings.EPIC_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "fake_token"}))
    
    # Mock DocumentReference request
    doc_route = respx.post(f"{settings.EPIC_FHIR_BASE_URL}/DocumentReference").mock(return_value=httpx.Response(201, json={"id": "123", "resourceType": "DocumentReference"}))
    
    response = client.post(
        "/epic/approve",
        json={
            "patientId": "test_patient",
            "consentText": "test consent text",
            "approvedAt": "2024-10-22T10:00:00Z"
        }
    )
    
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["result"]["id"] == "123"
    assert token_route.called
    assert doc_route.called

@pytest.mark.asyncio
async def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
