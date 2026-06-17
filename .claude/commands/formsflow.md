# formsflow.ai Developer Skill
## Formio · Camunda · Coding Assistant

You are an expert developer for the **formsflow.ai** platform (v8.1.0).
This project lives at `D:\forms-flow-ai`.

---

## PLATFORM OVERVIEW

formsflow.ai combines:
| Component | Tech | Port |
|-----------|------|------|
| `forms-flow-web` | React 17, Form.io | 3000 |
| `forms-flow-api` | Python Flask | 5000 |
| `forms-flow-bpm` | Camunda 7.21, Spring Boot | 8000 |
| `forms-flow-forms` | Form.io server | 3001 |
| `forms-flow-idm` | Keycloak | 8080 |
| `ehr_connectors` | FastAPI (SMART on FHIR) | 8002 |
| `forms-flow-immudb` | Flask + ImmuDB | 5001 |

---

## 1 · FORMIO SKILL

### Import Format Rules
- **Standalone form** → plain `{ "title", "name", "path", "type", "display", "components" }`
- **Bundle import** → `{ "forms": [...], "workflows": [...], "rules": [], "authorizations": [] }`
- Never use the bundle wrapper when the user says "form only"

### Critical Schema Rules
Every field MUST include these properties (copy from reference `epicFhirPatientConsentForm(4).json`):

```json
{
  "label": "...",
  "key": "...",
  "type": "textfield",
  "input": true,
  "tableView": false,
  "id": "e<random6chars>",
  "hideOnChildrenHidden": false,
  "placeholder": "",
  "prefix": "",
  "customClass": "",
  "suffix": "",
  "multiple": false,
  "defaultValue": null,
  "protected": false,
  "unique": false,
  "persistent": true,
  "hidden": false,
  "clearOnHide": true,
  "refreshOn": "",
  "redrawOn": "",
  "modalEdit": false,
  "dataGridLabel": false,
  "labelPosition": "top",
  "description": "",
  "errorLabel": "",
  "tooltip": "",
  "hideLabel": false,
  "tabindex": "",
  "disabled": false,
  "autofocus": false,
  "dbIndex": false,
  "customDefaultValue": "",
  "calculateValue": "",
  "calculateServer": false,
  "widget": { "type": "input" },
  "attributes": {},
  "validateOn": "change",
  "validate": { "required": false, "custom": "", "customPrivate": false, "strictDateValidation": false, "multiple": false, "unique": false },
  "conditional": { "show": null, "when": null, "eq": "" },
  "overlay": { "style": "", "left": "", "top": "", "width": "", "height": "" },
  "allowCalculateOverride": false,
  "encrypted": false,
  "showCharCount": false,
  "showWordCount": false,
  "properties": {},
  "allowMultipleMasks": false,
  "addons": [],
  "mask": false,
  "inputType": "text",
  "inputFormat": "plain",
  "inputMask": "",
  "displayMask": "",
  "spellcheck": true,
  "truncateMultipleSpaces": false
}
```

### Field Type Rules

**textfield** — include `mask`, `inputType: "text"`, `inputFormat`, `spellcheck`, `truncateMultipleSpaces`

**datetime** — NEVER use `"locale": "en"` or `"locale": "pt"` (causes flatpickr crash). Remove locale entirely.
```json
{
  "widget": {
    "type": "calendar",
    "displayInTimezone": "viewer",
    "useLocaleSettings": false,
    "allowInput": true,
    "mode": "single",
    "enableTime": false,
    "noCalendar": false,
    "format": "yyyy-MM-dd"
  }
}
```

**select** — always include `dataSrc`, `template`, `fuseOptions`, `indexeddb`:
```json
{
  "widget": "choicesjs",
  "dataSrc": "values",
  "data": { "values": [...], "json": "", "url": "", "resource": "", "custom": "" },
  "template": "<span>{{ item.label }}</span>",
  "searchThreshold": 0.3,
  "fuseOptions": { "include": "score", "threshold": 0.3 },
  "indexeddb": { "filter": {} },
  "lazyLoad": true,
  "authenticate": false,
  "ignoreCache": false
}
```

**phoneNumber** — use `inputType: "tel"`, `inputMask: "(999) 999-9999"`, `inputMode: "decimal"`

**email** — use `inputType: "email"`, include `kickbox: { "enabled": false }`

**hidden** — use `inputType: "hidden"`, no `widget.type: "input"` override needed

### Required Hidden System Fields
Always include these at the bottom of every form's `components` array:

| key | purpose |
|-----|---------|
| `applicationStatus` | workflow state |
| `applicationId` | formsflow submission ID |
| `medicalRecordNumber` | Epic MRN (auto-filled) |
| `patientId` | Epic FHIR patient ID |
| `currentUser` | `customDefaultValue` → `localdata?.preferred_username` |
| `submitterEmail` | `customDefaultValue` → `localdata?.email` |
| `submitterFirstName` | `customDefaultValue` → `localdata?.given_name` |
| `submitterLastName` | `customDefaultValue` → `localdata?.family_name` |
| `currentUserRoles` | `calculateValue` → strips `/` from groups array |
| `surrogateKey` | `customDefaultValue` → UUID generator JS |

### Layout Containers
Use this hierarchy inside panels:
```
panel
  └── well        (groups related fields)
        └── columns  (side-by-side layout)
              └── fields
```
- **well** — `type: "well"`, `input: false`, `persistent: false`
- **columns** — each column needs `width`, `offset`, `push`, `pull`, `size: "md"`, `currentWidth`
- **panel** — needs `breadcrumb: "default"`, `tags: []`, `logic: []`, `customConditional: ""`

### Submit Button Pattern (right-aligned)
```json
{
  "label": "buttons",
  "type": "columns",
  "key": "submitButtonColumns",
  "columns": [
    { "components": [], "width": 6 },
    { "components": [{ "label": "Submit", "type": "button", "action": "submit", "theme": "primary", "leftIcon": "fa fa-save" }], "width": 6 }
  ]
}
```

### Review Panel Pattern (visible only to reviewers)
```json
{
  "type": "panel",
  "title": "Review",
  "key": "reviewPanel",
  "customConditional": "const UserDetails = JSON.parse(localStorage.getItem('UserDetails'))\nconst groups = UserDetails['groups']\nif(groups.includes('/formsflow/formsflow-reviewer') && data.applicationStatus==='New') {\nshow = true;\n} else {\nshow = false;\n};",
  "components": [
    { "key": "actionType", "type": "select", "data": { "values": [{ "label": "Approved", "value": "Approved" }, { "label": "Rejected", "value": "Rejected" }] } },
    { "key": "submitAction", "type": "button", "action": "custom", "custom": "const submissionId = form._submission._id;\nconst formio = new Formio(form.formio.formUrl+'/submission/'+submissionId);\nformio.saveSubmission({ _id: submissionId, data: data }).then(result => {\n  form.emit('customEvent', { type: 'actionComplete', component: component, actionType: data.actionType });\n});" }
  ]
}
```

---

## 2 · CAMUNDA BPMN SKILL

### File Location
`forms-flow-bpm/forms-flow-bpm-camunda/src/main/resources/processes/<process-name>/<process-name>.bpmn`

### Required Namespaces
```xml
xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
```

### Standard Listeners (always use these)
```xml
<!-- Set status on sequence flow -->
<camunda:executionListener event="take">
  <camunda:script scriptFormat="javascript">
    execution.setVariable('applicationStatus', 'New');
  </camunda:script>
</camunda:executionListener>

<!-- Sync fields to formsflow API -->
<camunda:executionListener
  class="org.camunda.bpm.extension.hooks.listeners.BPMFormDataPipelineListener"
  event="take">
  <camunda:field name="fields">
    <camunda:expression>["applicationId","applicationStatus","surrogateKey"]</camunda:expression>
  </camunda:field>
</camunda:executionListener>

<!-- Persist app state -->
<camunda:executionListener
  class="org.camunda.bpm.extension.hooks.listeners.ApplicationStateListener"
  event="take"/>

<!-- On task complete: copy action → applicationStatus -->
<camunda:taskListener event="complete">
  <camunda:script scriptFormat="javascript">
    task.execution.setVariable('applicationStatus', task.execution.getVariable('action'));
    task.execution.setVariable('deleteReason', 'completed');
  </camunda:script>
</camunda:taskListener>
```

### UserTask Pattern
```xml
<bpmn:userTask id="reviewer" name="Review Submission"
               camunda:candidateGroups="formsflow/formsflow-reviewer">
```

### HTTP Connector (calling EHR connector)
```xml
<bpmn:serviceTask id="Activity_EhrCall" name="Write to Epic">
  <bpmn:extensionElements>
    <camunda:connector>
      <camunda:inputOutput>
        <camunda:inputParameter name="url">http://192.168.x.x:8002/epic/patient-create</camunda:inputParameter>
        <camunda:inputParameter name="method">POST</camunda:inputParameter>
        <camunda:inputParameter name="headers">
          <camunda:map>
            <camunda:entry key="Content-Type">application/json</camunda:entry>
          </camunda:map>
        </camunda:inputParameter>
        <camunda:inputParameter name="payload">
          <camunda:script scriptFormat="javascript">
            JSON.stringify({
              patientId:     execution.getVariable('patientId'),
              surrogateKey:  execution.getVariable('surrogateKey'),
              applicationId: execution.getVariable('applicationId')
            });
          </camunda:script>
        </camunda:inputParameter>
        <camunda:outputParameter name="epicResponse">${response}</camunda:outputParameter>
      </camunda:inputOutput>
      <camunda:connectorId>http-connector</camunda:connectorId>
    </camunda:connector>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

### Gateway Conditions
```xml
<!-- Approved -->
<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${action == 'Approved'}</bpmn:conditionExpression>

<!-- Rejected -->
<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${action == 'Rejected'}</bpmn:conditionExpression>
```

### surrogateKey — always preserve across tasks
```javascript
// Start event listener
var existing = execution.getVariable('surrogateKey');
if (!existing || existing === '') {
  var uuid = java.util.UUID.randomUUID().toString();
  execution.setVariable('surrogateKey', uuid);
}
```

### Standard Workflow Pattern
```
StartEvent
  │ → set applicationStatus = 'New', BPMFormDataPipelineListener, ApplicationStateListener
  ▼
UserTask (formsflow/formsflow-reviewer)
  │ → FormSubmissionListener, ApplicationStateListener
  ▼
ExclusiveGateway
  ├── Approved → ServiceTask (HTTP → EHR) → UpdateStatus → EndEvent
  └── Rejected → UpdateStatus → EndEvent
```

---

## 3 · CODING SKILL

### EHR Connector (FastAPI — `ehr_connectors/`)

**New endpoint template:**
```python
class MyRequest(BaseModel):
    patientId: str
    fieldName: Optional[str] = None

@app.post("/epic/my-endpoint")
async def my_endpoint(request: MyRequest):
    try:
        result = await epic_service.my_method(
            patient_id=request.patientId,
            field=request.fieldName
        )
        return {"ok": True, "result": result}
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

**EpicService method template:**
```python
async def my_fhir_method(self, patient_id: str) -> dict:
    token_data = await self.get_access_token()
    token = token_data["access_token"]
    response = await self.client.post(
        "/ResourceType/",
        json=fhir_payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/fhir+json",
            "Accept": "application/fhir+json",
        }
    )
    response.raise_for_status()
    location = response.headers.get("Location", "")
    return {
        "status": "created",
        "id": location.rstrip("/").split("/")[-1],
        "location": location
    }
```

### FHIR R4 Patient Resource Structure
```json
{
  "resourceType": "Patient",
  "identifier": [{ "use": "usual", "type": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v2-0203", "code": "MR" }] }, "value": "<mrn>" }],
  "active": true,
  "name": [{ "use": "official", "family": "<lastName>", "given": ["<firstName>", "<middleName>"] }],
  "telecom": [
    { "system": "phone", "value": "<phone>", "use": "home" },
    { "system": "email", "value": "<email>" }
  ],
  "gender": "male|female|other|unknown",
  "birthDate": "YYYY-MM-DD",
  "address": [{ "use": "home", "line": ["<addressLine1>"], "city": "<city>", "state": "<state>", "postalCode": "<zip>", "country": "<country>" }]
}
```

### EHR Frontend (React — `forms-flow-web/src/integrations/ehr/`)

**Key files:**
| File | Purpose |
|------|---------|
| `service.js` | `launchSMART()`, `fetchPatientData()` |
| `mapper.js` | `mapPatientToFormio(patient, form)` |
| `hooks.js` | `useEhrPatientData({ form, autoFetch })` |
| `config.js` | `isEhrEnabled()`, `getSMARTConfig()` |

**sessionStorage keys:** `epic_iss`, `epic_launch`, `epic_code`, `epic_isEHR`, `epic_formId`

### formsflow.ai API (Flask — `forms-flow-api/`)
- Base URL: `http://localhost:5000`
- Auth: Keycloak Bearer token
- Key endpoints: `/application`, `/form`, `/task`, `/submission`

---

## QUICK REFERENCE

### Common Mistakes to Avoid
| ❌ Wrong | ✅ Right |
|----------|----------|
| `"locale": "en"` in datetime widget | Remove `locale` entirely |
| `"locale": "pt"` in datetime widget | Remove `locale` entirely |
| `"id": "firstName"` (using key as ID) | `"id": "e1e2aj7p"` (short random) |
| Raw form object for bundle import | Wrap in `{ "forms": [...], "workflows": [], ... }` |
| `action` key for reviewer dropdown | `actionType` key |
| Missing `well` inside panel | Use `panel → well → columns → fields` |
| Missing hidden system fields | Always add 10 hidden fields |

### File Paths
```
forms-flow-forms/          → Form.io form JSON files
forms-flow-bpm/.../processes/  → BPMN workflow files
ehr_connectors/src/main.py     → FastAPI endpoints
ehr_connectors/src/services/epic_service.py → FHIR calls
forms-flow-web/src/integrations/ehr/       → Frontend EHR code
deployment/docker/.env         → Environment config
```

### Environment Variables (deployment/docker/.env)
```
EHR_CONNECTOR_URL=http://<host-ip>:8002
IMMUDB_WORKER_ENABLED=true
IMMUDB_WORKER_URL=http://<host-ip>:5001/api/v1
REACT_APP_SMART_CLIENT_ID=<epic-client-id>
REACT_APP_SMART_REDIRECT_URI=http://localhost:3000/public/form/<formId>
REACT_APP_SMART_SCOPE=launch launch/patient patient/*.read
```
