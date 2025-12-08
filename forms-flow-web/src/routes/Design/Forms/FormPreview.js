import { Form } from "@aot-technologies/formio-react";
import React, { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { RESOURCE_BUNDLES_DATA } from "../../../resourceBundles/i18n.js";
import { fetchFormById } from "../../../apiManager/services/bpmFormServices.js";
import Loading from "../../../containers/Loading.js";
import { launchSMART, fetchPatientData } from "../../../services/ehrService.js";
import { mapPatientToFormio } from "../../../services/ehrMapper.js";
import { getSMARTConfig, debugLog, debugError } from "../../../services/ehrConfig.js";

const FormPreview = () => {
  const lang = useSelector((state) => state.user.lang);
  const { formId } = useParams();
  const location = useLocation();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [formError, setFormError] = useState(null);
  const formRef = useRef(null);
  
  // Update form submission when it changes after form is ready
  useEffect(() => {
    if (submission && formRef.current) {
      debugLog("Submission updated, applying to form:", submission);
      formRef.current.submission = submission;
      // Try to set values directly on components
      if (formRef.current.setValue && submission.data) {
        Object.keys(submission.data).forEach(key => {
          const component = formRef.current.getComponent(key);
          if (component && submission.data[key]) {
            component.setValue(submission.data[key], { modified: false });
          }
        });
      }
    }
  }, [submission]);

  useEffect(() => {
    // Check for isEHR query parameter
    const queryParams = new URLSearchParams(location.search);
    const isEHR = queryParams.get('isEHR') === 'true' || queryParams.get('isEHR') === '';
    
    if (!formId) {
      setFormError("Form ID is missing from the URL. Please ensure you're accessing the form with a valid form ID.");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setFormError(null);
    
    // Fetch form data by ID
    fetchFormById(formId)
        .then((res) => {
          if (res.data) {
            const { data } = res;
            setForm(data);
            
            // If isEHR is true, launch SMART and fetch patient data
            const smartConfig = getSMARTConfig(formId);
            if (isEHR && smartConfig.clientId) {
              launchSMART(
                smartConfig.clientId,
                smartConfig.redirectUri,
                smartConfig.scope
              )
                .then((fhirClient) => {
                  return fetchPatientData(fhirClient);
                })
                .then((patientData) => {
                  // Map patient demographics to form fields
                  const mappedData = mapPatientToFormio(patientData.patient, data);
                  
                  debugLog("=== EHR Mapping Debug ===");
                  debugLog("Patient data from EHR:", patientData.patient);
                  debugLog("Form schema:", data);
                  debugLog("Mapped form data:", mappedData);
                  debugLog("Form field keys:", data.components?.map(c => c.key).filter(Boolean));
                  debugLog("Number of mapped fields:", Object.keys(mappedData).length);
                  
                  // Create submission object for Form.io
                  const submissionData = {
                    data: mappedData
                  };
                  
                  debugLog("Submission object:", submissionData);
                  setSubmission(submissionData);
                  
                  // If form is already rendered, update it directly
                  if (formRef.current) {
                    debugLog("Form already rendered, updating submission directly");
                    formRef.current.submission = submissionData;
                  }
                })
                .catch((err) => {
                  debugError("Error fetching patient data from EHR:", err);
                  // Error is logged but not displayed to user in preview mode
                  // Form will load without pre-filled patient data
                });
            }
          } else {
            setFormError("Form data not found");
          }
        })
        .catch((err) => {
          debugError(
            "Error fetching form data:",
            err.response?.data || err.message
          );
          const errorMessage = err.response?.data?.message || 
                              err.response?.data || 
                              err.message || 
                              "Failed to load form";
          setFormError(errorMessage);
        })
        .finally(() => {
          setLoading(false);
        });
  }, [formId, location.search]);

  if (loading) {
    return <Loading />;
  }

  // Show error if form failed to load or formId is missing
  if (formError || !formId) {
    return (
      <div className="form-preview-tab">
        <div className="alert alert-danger" role="alert">
          <strong>Error loading form:</strong> {formError || "Form ID is missing from the URL"}
          <br />
          <small>
            {formId 
              ? "Please check the form ID and try again." 
              : "Please ensure you're accessing the form with a valid form ID in the URL."}
          </small>
        </div>
      </div>
    );
  }

  // Don't render form if it's not loaded yet
  if (!form) {
    return (
      <div className="form-preview-tab">
        <div className="alert alert-warning" role="alert">
          <strong>Form not available</strong>
          <br />
          <small>The form could not be loaded. Please check the form ID and try again.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="form-preview-tab">
      <div className="preview-header-text mb-4">{form?.title}</div>

      {(() => {
        const queryParams = new URLSearchParams(location.search);
        const isEHR = queryParams.get('isEHR') === 'true' || queryParams.get('isEHR') === '';
        if (isEHR) {
          const smartConfig = getSMARTConfig(formId);
          if (!smartConfig.clientId) {
            return (
              <div className="alert alert-info mb-3" role="alert">
                <strong>EHR Integration:</strong> SMART client ID not configured. 
                Please set REACT_APP_SMART_CLIENT_ID environment variable.
              </div>
            );
          }
        }
        return null;
      })()}
      <div>
        <Form
          form={form}
          submission={submission}
          formReady={(formInstance) => {
            formRef.current = formInstance;
            debugLog("Form ready callback triggered");
            debugLog("Current submission prop:", submission);
            debugLog("Form instance submission:", formInstance.submission);
            
            // If we have submission data, set it on the form instance
            if (submission) {
              debugLog("Setting submission on form instance:", submission);
              formInstance.submission = submission;
              // Trigger form update
              if (formInstance.setValue) {
                Object.keys(submission.data || {}).forEach(key => {
                  const component = formInstance.getComponent(key);
                  if (component) {
                    component.setValue(submission.data[key], { modified: false });
                  }
                });
              }
            }
          }}
          options={{
            disableAlerts: true,
            noAlerts: true,
            language: lang,
            i18n: RESOURCE_BUNDLES_DATA,
            buttonSettings: { showCancel: false },
          }}
        />
      </div>
    </div>
  );
};

export default FormPreview;
