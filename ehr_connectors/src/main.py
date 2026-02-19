from fastapi import FastAPI, HTTPException, Body
from src.services.epic_service import EpicService
from src.config import get_settings
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="EHR Connector API")
epic_service = EpicService()

class ApprovalRequest(BaseModel):
    patientId: str
    consentText: str
    approvedAt: Optional[str] = None

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/epic/approve")
async def approve_to_epic(request: ApprovalRequest):
    """
    Endpoint to be called by Service Task to send approval status to Epic.
    """
    try:
        result = await epic_service.send_approval_status(
            patient_id=request.patientId,
            consent_text=request.consentText,
            approved_at=request.approvedAt
        )
        return {"ok": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send status to Epic: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
