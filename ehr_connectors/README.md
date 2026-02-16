# EHR Connector Service

A secure, server-side bridge between **FormsFlow.ai** and **Electronic Health Record (EHR)** systems (e.g., Epic). This service enables BPMN workflows to securely communicate form statuses and data back to the EHR using the SMART on FHIR protocol.

## Purpose
Previously, sending "Approved" status back to the EHR was handled by the frontend, which posed security risks and lacked reliability for automated workflows. This service moves that logic to a secure Python FastAPI backend that can be called directly by **Camunda Service Tasks**.

## Features
- **Secure Communication**: Handles OAuth2 Client Credentials flow for server-to-server FHIR API access.
- **FHIR Integration**: Implements DocumentReference resource submission to Epic.
- **BPMN Ready**: Designed to be called via Camunda's `http-connector`.
- **Extensible**: Built as a generic bridge that can be expanded to support more FHIR resources (Observations, Appointments, etc.) in the future.

## Getting Started

### Prerequisites
- Python 3.9+
- Client ID and Client Secret from your EHR provider (e.g., Epic App Orchard)

### Installation
1. Navigate to the service directory:
   ```bash
   cd ehr_connectors
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Configuration
Create a `.env` file in the `ehr_connectors` directory based on `.env.example`:
```env
EPIC_FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
EPIC_TOKEN_URL=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
EPIC_CLIENT_ID=your_client_id
EPIC_CLIENT_SECRET=your_client_secret
PORT=8002
```

### Running the Service
Start the development server:
```bash
python -m src.main
```
The service will be available at `http://localhost:8002`. You can view the API documentation at `http://localhost:8002/docs`.

## End-to-End Workflow

### 1. Form Submission
A user launches a form from within the EHR (SMART on FHIR launch). The form is pre-filled with patient context.

### 2. Approval Workflow
Upon form submission, a Camunda process is triggered. An "Approver" reviews the submission.

### 3. Service Task Execution
Once approved, the BPMN process reaches a **Service Task** configured to call this connector.

**Service Task Configuration:**
- **Connector ID**: `http-connector`
- **URL**: `http://<ehr-connector-host>:8002/epic/approve`
- **Method**: `POST`
- **Payload**:
  ```json
  {
    "patientId": "${patientId}",
    "consentText": "Patient has approved the consent form.",
    "approvedAt": "${approvedAt}"
  }
  ```

### 4. EHR Update
The EHR Connector requests a secure token from Epic and POSTs a `DocumentReference` to the patient's record. The approval is now permanently and securely logged in the EHR.

## Development and Testing
Run unit tests with pytest:
```bash
pytest test_connector.py
```

## Security
- **Server-Side**: OAuth secrets are never exposed to the browser.
- **Audit Trail**: All communications are logged server-side for easier auditing.
- **Scoped Access**: Uses specific FHIR scopes to limit the connector's permissions.
