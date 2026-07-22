import json
import os


def main():
    # Paths to files
    form_path = "mental-health-screening-form.json"
    bpmn_path = "../forms-flow-bpm/forms-flow-bpm-camunda/src/main/resources/processes/mental-health-screening/mental-health-screening-workflow.bpmn"
    if not os.path.exists(bpmn_path):
        bpmn_path = "../forms-flow-bpm/forms-flow-bpm-camunda/src/main/resources/processes/mental-health-screening/mental-health-screening-workflow-1.bpmn"
    output_path = "mental-health-screening-design-bundle.json"

    # Read form schema
    with open(form_path, "r", encoding="utf-8") as f:
        form_content = json.load(f)

    # Read BPMN XML content
    with open(bpmn_path, "r", encoding="utf-8") as f:
        bpmn_content = f.read()

    # Task-list columns surfaced to reviewers, plus truly-hidden metadata.
    # "type" mirrors each field's actual Form.io component type where the
    # field exists as a real component (textfield/hidden), matching the
    # convention used by epicFhirPatientConsentFormV3-local-updated.json.
    task_variable = json.dumps([
        {"key": "applicationId", "label": "Submission Id", "type": "hidden"},
        {"key": "applicationStatus", "label": "Submission Status", "type": "hidden"},
        {"key": "submitterEmail", "label": "Submitter Email", "type": "hidden"},
        {"key": "patientId", "label": "Patient ID", "type": "textfield"},
        {"key": "medicalRecordNumber", "label": "Medical Record Number", "type": "textfield"},
        {"key": "phq9Total", "label": "PHQ-9 Total Score", "type": "hidden"},
        {"key": "gad7Total", "label": "GAD-7 Total Score", "type": "hidden"},
        {"key": "phq9SafetyFlag", "label": "PHQ-9 Safety Flag", "type": "hidden"},
        {"key": "needsClinicalReview", "label": "Needs Clinical Review", "type": "hidden"},
    ])

    # Construct the FormsFlow.ai import bundle structure
    bundle = {
        "forms": [
            {
                "formTitle": "PHQ-9 / GAD-7 Mental Health Screening",
                "formDescription": "Standardized PHQ-9/GAD-7 mental health screening for EHR integration.",
                "anonymous": False,
                "type": "form",
                "taskVariable": task_variable,
                "content": form_content
            }
        ],
        "workflows": [
            {
                "processKey": "mental-health-screening-workflow",
                "processName": "mental-health-screening-workflow",
                "processType": "BPMN",
                "type": "bpmn",
                "content": bpmn_content
            }
        ],
        "authorizations": [
            {
                "APPLICATION": {
                    "resourceId": "mentalHealthScreening",
                    "resourceDetails": {},
                    "roles": ["formsflow-client", "formsflow-reviewer"],
                    "userName": None
                },
                "FORM": {
                    "resourceId": "mentalHealthScreening",
                    "resourceDetails": {},
                    "roles": ["formsflow-client", "formsflow-reviewer"],
                    "userName": None
                },
                "DESIGNER": {
                    "resourceId": "mentalHealthScreening",
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
