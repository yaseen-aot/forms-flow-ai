from fastapi import FastAPI, HTTPException, Body
from src.services.epic_service import EpicService
from src.config import get_settings
from pydantic import BaseModel
from typing import Optional

import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    logger.info(f"Received approval request for patient: {request.patientId}")
    try:
        result = await epic_service.send_approval_status(
            patient_id=request.patientId,
            consent_text=request.consentText,
            approved_at=request.approvedAt
        )
        logger.info(f"Successfully sent approval status to Epic for patient: {request.patientId}")
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error(f"Error in approve_to_epic for patient {request.patientId}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send status to Epic: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
