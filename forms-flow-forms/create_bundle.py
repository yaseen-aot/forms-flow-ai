import json
import os

def main():
    # Paths to files
    form_path = "patient-info-form.json"
    bpmn_path = "../forms-flow-bpm/forms-flow-bpm-camunda/src/main/resources/processes/patient-info/patient-info-workflow.bpmn"
    output_path = "patient-info-design-bundle.json"

    # Read form schema
    with open(form_path, "r", encoding="utf-8") as f:
        form_content = json.load(f)

    # Read BPMN XML content
    with open(bpmn_path, "r", encoding="utf-8") as f:
        bpmn_content = f.read()

    # Construct the FormsFlow.ai import bundle structure
    bundle = {
        "forms": [
            {
                "formTitle": "Patient Information",
                "formDescription": "Patient self-registration form for EHR integration.",
                "anonymous": True,
                "type": "form",
                "content": form_content
            }
        ],
        "workflows": [
            {
                "processKey": "patient-info-workflow",
                "processName": "patient-info-workflow",
                "processType": "BPMN",
                "type": "bpmn",
                "content": bpmn_content
            }
        ],
        "authorizations": [
            {
                "APPLICATION": {
                    "resourceId": "patientInformation",
                    "resourceDetails": {},
                    "roles": ["formsflow-client", "formsflow-reviewer"],
                    "userName": None
                },
                "FORM": {
                    "resourceId": "patientInformation",
                    "resourceDetails": {},
                    "roles": ["formsflow-client", "formsflow-reviewer"],
                    "userName": None
                },
                "DESIGNER": {
                    "resourceId": "patientInformation",
                    "resourceDetails": {},
                    "roles": ["formsflow-designer"],
                    "userName": None
                }
            }
        ],
        "rules": []
    }

    # Write the combined bundle
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)

    print(f"Successfully generated combined FormsFlow.ai import bundle at: {output_path}")

if __name__ == "__main__":
    main()
