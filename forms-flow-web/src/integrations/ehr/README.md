# EHR Integration Guide

## Overview
This module provides SMART on FHIR integration (Epic) for Forms Flow Web. It implements:
- OAuth2 (SMART on FHIR) launch and token exchange
- Patient lookup and patient demographics fetching
- Consent document creation and submission (FHIR DocumentReference)

The implementation lives under `src/integrations/ehr` and exposes a small runtime API on `window.formsflowEhr` for use by the rest of the app.

---

## Current implementation (files)
- `service.js` — SMART initialization (`launchSMART`), `getPatient`, and `fetchPatientData` (handles JWT/session fallbacks and friendly error messages)
- `epicConsent.js` — `sendConsentDocumentToEpic`, `initializeSMART`, and registration of `window.formsflowEhr`
- `config.js` — logging and configuration helpers
- `IMPLEMENTATION_GUIDE.md` — integration notes and where to call consent submission from form flows

---

## Configuration
Add these environment variables to your `.env` or set via `window._env_` (recommended for local dev):

```env
# Epic / SMART configuration used by the EHR module
REACT_APP_EPIC_CLIENT_ID=your_epic_client_id
REACT_APP_EPIC_REDIRECT_URI=https://your-app.dev/launch.html
REACT_APP_EPIC_SCOPE=launch patient/Patient.read patient/Observation.read

# Optional alternate keys used by config.js
REACT_APP_SMART_CLIENT_ID=...
REACT_APP_SMART_REDIRECT_URI=...
REACT_APP_SMART_SCOPE=...

# Debugging
NODE_ENV=development
REACT_APP_EHR_DEBUG=true
```

Example via `window._env_`:

```javascript
window._env_ = {
  REACT_APP_EPIC_CLIENT_ID: "your_epic_client_id",
  REACT_APP_EPIC_REDIRECT_URI: "https://your-app.dev/launch.html",
  REACT_APP_EPIC_SCOPE: "launch patient/Patient.read patient/Observation.read",
  REACT_APP_EHR_DEBUG: "true"
};
```

---

## Runtime API & Usage
When the module loads it registers the following APIs on `window.formsflowEhr` and may auto-initialize the SMART client when `isEHR` flag is present on the URL.

- `window.formsflowEhr.initializeSMART()` — Manually initialize the SMART client and store it on `window.__formsflowSmartClient`.
- `window.formsflowEhr.launchSMART(clientId, redirectUri, scope)` — Low-level launch helper (returns a fhirclient smart client).
- `window.formsflowEhr.getPatient(client)` — Read patient resource from FHIR server using an initialized client.
- `window.formsflowEhr.fetchPatientData(client, patientId?)` — Higher-level fetch with multiple fallbacks (context patient, token payload, or explicit ID).
- `window.formsflowEhr.sendConsentToEpic(submissionData)` — Create and POST `DocumentReference` to FHIR server for consent records.

Usage examples

- Auto-initialization (if launched from Epic):

```text
https://your-app.com/form/form-id?isEHR=true&iss=...&launch=...
```
The module will detect `isEHR` and attempt to initialize the SMART client automatically.

- Manual initialization:
```javascript
const client = await window.formsflowEhr.initializeSMART();
```

- Fetch patient data:
```javascript
const { patient } = await window.formsflowEhr.fetchPatientData(window.__formsflowSmartClient);
```

- Send consent document:
```javascript
await window.formsflowEhr.sendConsentToEpic({
  approved: true,
  approvedAt: new Date().toISOString(),
  consentText: 'Patient consent approved via form.'
});
```

---

## Key implementation notes
- The module dynamically imports `fhirclient` at runtime. If not installed, the code throws a descriptive error asking to `npm install fhirclient`.
- OAuth flow handling supports parameters in the URL (`iss`, `launch`, `code`, `state`) and also stores intermediate values in `sessionStorage` to survive redirects.
- `fetchPatientData` has multiple fallbacks to determine the patient ID (client.patient.id, tokenResponse.patient, or decoding a JWT-like token in sessionStorage).
- Network/HTML responses from FHIR servers are detected and converted into friendly errors (the code checks for HTML/JSON parse errors and returns actionable messages).
- The SMART client instance is stored at `window.__formsflowSmartClient` for convenience.

---

## Error handling & Troubleshooting
- SMART client not initialized: ensure the app is launched from Epic with `?isEHR=true` or call `initializeSMART()` manually.
- No patient in SMART context: ensure Epic launch includes a patient context and the required SMART scopes are present (e.g., `launch patient/Patient.read`).
- FHIR server returned HTML or non-JSON: verify your FHIR base URL and network connectivity — the code will throw a helpful message indicating an HTML response.
- Patient not found or deleted: the `parseFhirError` helper will return user-friendly messages when an OperationOutcome indicates deletion or not-found.

For integration-specific notes and where to call `sendConsentDocumentToEpic()`, see `IMPLEMENTATION_GUIDE.md` which describes the exact insertion points in the form submission flow (View.js, UserForm.js, Edit.js, ResubmitForm.js).

---

## Debugging
Enable debug logs by setting `NODE_ENV=development` or `REACT_APP_EHR_DEBUG=true`. The module exposes `debugLog`, `debugWarn`, and `debugError` based on `config.js`.

Console hints you'll see in development:
```
[EHR Info] Initializing SMART client { clientId: "..." }
[EHR Info] SMART client initialized successfully { patientId: "12345" }
[EHR Error] Detailed error object
```

---

## Dependencies
- `fhirclient` (SMART on FHIR client library)
- Modern browser (fetch API, atob)

Install with:
```bash
npm install fhirclient
```

---

## Best Practices ✅
- Always verify `window.__formsflowSmartClient` before making FHIR requests.
- Handle failures from `sendConsentToEpic()` gracefully — the function returns `{ ok: true/false, ... }` and includes the error body when available.
- Prefer the `IMPLEMENTATION_GUIDE.md` for step-by-step guidance on wiring the consent submission into existing form submission callbacks.

---

If something doesn't work as expected, open an issue with a minimal reproduction and include console logs (with debug enabled).
