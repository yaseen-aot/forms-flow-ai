from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
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
    surrogateKey: Optional[str] = None
    approvedAt: Optional[str] = None

class PatientCreateRequest(BaseModel):
    fhirPatient: dict
    reviewerComments: Optional[str] = None
    notes: Optional[str] = None
    applicationId: Optional[str] = None

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
            surrogate_key=request.surrogateKey,
            approved_at=request.approvedAt
        )
        logger.info(f"Successfully sent approval status to Epic for patient: {request.patientId}")
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error(f"Error in approve_to_epic for patient {request.patientId}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send status to Epic: {str(e)}")

@app.post("/epic/patient-create")
async def create_patient_endpoint(request: PatientCreateRequest):
    """
    Endpoint to be called by Service Task to create a patient in Epic.
    """
    logger.info(f"Received patient creation request for Application: {request.applicationId}")
    try:
        result = await epic_service.create_patient(
            fhir_patient=request.fhirPatient
        )
        logger.info(f"Successfully created patient in Epic. Application: {request.applicationId}")
        return result
    except Exception as e:
        logger.error(f"Error in create_patient_endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create patient: {str(e)}")

@app.get("/epic/documents")
async def search_documents_endpoint(patientId: str):
    """
    Search DocumentReferences for a patient.
    """
    try:
        result = await epic_service.search_documents(patient_id=patientId)
        return result
    except Exception as e:
        logger.error(f"Error in search_documents for patient {patientId}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to search documents in Epic: {str(e)}")

@app.get("/epic/binary/{binary_id}")
async def get_binary_endpoint(binary_id: str):
    """
    Fetch a Binary file and return it.
    """
    try:
        content = await epic_service.get_binary(binary_id=binary_id)
        return Response(content=content, media_type="application/octet-stream")
    except Exception as e:
        logger.error(f"Error in get_binary for id {binary_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch Binary from Epic: {str(e)}")

@app.get("/epic/patient/{patient_id}")
async def get_patient_endpoint(patient_id: str):
    try:
        result = await epic_service.get_patient(patient_id=patient_id)
        return result
    except Exception as e:
        logger.error(f"Error in get_patient for patient {patient_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch Patient from Epic: {str(e)}")

@app.get("/epic/encounter/{encounter_id}")
async def get_encounter_endpoint(encounter_id: str):
    try:
        result = await epic_service.get_encounter(encounter_id=encounter_id)
        return result
    except Exception as e:
        logger.error(f"Error in get_encounter for encounter {encounter_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch Encounter from Epic: {str(e)}")

@app.get("/epic/documentref/{docref_id}")
async def get_documentref_endpoint(docref_id: str):
    try:
        result = await epic_service.get_documentref(docref_id=docref_id)
        return result
    except Exception as e:
        logger.error(f"Error in get_documentref for docref {docref_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch DocumentReference from Epic: {str(e)}")

@app.get("/epic/encounters")
async def search_encounters_endpoint(patientId: str):
    try:
        result = await epic_service.search_encounters(patient_id=patientId)
        return result
    except Exception as e:
        logger.error(f"Error in search_encounters for patient {patientId}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to search encounters in Epic: {str(e)}")

# HTML Fallbacks to serve SPA client routing
from fastapi.responses import HTMLResponse

@app.get("/patient", response_class=HTMLResponse)
@app.get("/patient/{path:path}", response_class=HTMLResponse)
@app.get("/documentref", response_class=HTMLResponse)
@app.get("/documentref/{path:path}", response_class=HTMLResponse)
@app.get("/encounter", response_class=HTMLResponse)
@app.get("/encounter/{path:path}", response_class=HTMLResponse)
async def serve_spa_index():
    import os
    index_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# Mount static files at the root
app.mount("/", StaticFiles(directory="src/static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
