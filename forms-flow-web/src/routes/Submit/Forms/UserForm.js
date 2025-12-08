import React, { useCallback, useEffect, useRef, useState } from "react";
import { push } from "connected-react-router";
import { connect, useDispatch, useSelector } from "react-redux";
import {
  selectRoot,
  resetSubmissions,
  saveSubmission,
  Form,
  selectError,
  Errors,
  getForm,
  Formio,
} from "@aot-technologies/formio-react";
import { useTranslation, Translation } from "react-i18next";
import isEqual from "lodash/isEqual";

import Loading from "../../../containers/Loading";
import {
  getProcessReq,
  getDraftReqFormat,
} from "../../../apiManager/services/bpmServices";
import { RESOURCE_BUNDLES_DATA } from "../../../resourceBundles/i18n";
import {
  setFormFailureErrorData,
  setFormRequestData,
  setFormSubmissionError,
  setFormSubmissionLoading,
  setFormSuccessData,
  setMaintainBPMFormPagination,
  setFormSubmitted,
} from "../../../actions/formActions";
import { publicApplicationStatus } from "../../../apiManager/services/applicationServices";
import LoadingOverlay from "react-loading-overlay-ts";
import { CUSTOM_EVENT_TYPE } from "../../../components/ServiceFlow/constants/customEventTypes";
import { toast } from "react-toastify";
import { fetchFormByAlias } from "../../../apiManager/services/bpmFormServices";
import { checkIsObjectId } from "../../../apiManager/services/formatterService";
import {
  draftCreate,
  draftUpdate,
  publicDraftCreate,
  publicDraftUpdate,
} from "../../../apiManager/services/draftService";
import { setPublicStatusLoading } from "../../../actions/applicationActions";
import { postCustomSubmission } from "../../../apiManager/services/FormServices";
import {
  CUSTOM_SUBMISSION_URL,
  CUSTOM_SUBMISSION_ENABLE,
  MULTITENANCY_ENABLED,
  DRAFT_ENABLED,
  DRAFT_POLLING_RATE,
} from "../../../constants/constants";
import useInterval from "../../../customHooks/useInterval";
import selectApplicationCreateAPI from "../../../components/Form/constants/apiSelectHelper";
import {
  getApplicationCount,
  getFormProcesses,
} from "../../../apiManager/services/processServices";
import { setFormStatusLoading } from "../../../actions/processActions";
import { renderPage } from "../../../helper/helper";
import PropTypes from "prop-types";
// import { Card } from "react-bootstrap";
import { BreadCrumbs, BreadcrumbVariant } from "@formsflow/components";
import { navigateToFormEntries, navigateToSubmitFormsListing } from "../../../helper/routerHelper";
import { cloneDeep } from "lodash";
import { useParams, useLocation } from "react-router-dom";
import { launchSMART, fetchPatientData } from "../../../services/ehrService";
import { mapPatientToFormio } from "../../../services/ehrMapper";
import { getSMARTConfig, debugLog, debugError, debugWarn } from "../../../services/ehrConfig";

const View = React.memo((props) => {
  const [formStatus, setFormStatus] = React.useState("");
  const { t } = useTranslation();

  const parentFormId = useSelector(
    (state) => state.form.form?.parentFormId
  );
  const { formId } = useParams();
  const location = useLocation();
  const lang = useSelector((state) => state.user.lang);
  const pubSub = useSelector((state) => state.pubSub);
  const isPublic = !props.isAuthenticated;
  const [ehrSubmission, setEhrSubmission] = useState(null);
  const [ehrError, setEhrError] = useState(null);
  const tenantKey = useSelector((state) => state.tenants?.tenantId);
  const redirectUrl = MULTITENANCY_ENABLED ? `/tenant/${tenantKey}/` : "/";
  const draftSubmission = useSelector((state) => state.draft.draftSubmission || {});
  const draftId = draftSubmission?.id;

  const {
    isFormSubmissionLoading,
    formSubmitted: isFormSubmitted,
    publicFormStatus,
  } = useSelector((state) => state.formDelete) || {};

  const draftSubmissionId = draftSubmission?.applicationId || draftId;

  // Holds the latest data saved by the server
  const { formStatusLoading, processLoadError } =
    useSelector((state) => state.process) || {};

  const isPublicStatusLoading = useSelector(
    (state) => state.applications.isPublicStatusLoading
  );

  /**
   * `draftData` is used for keeping the uptodate form entry,
   * this will get updated on every change the form is having.
   */

  const isDraftEdit = Boolean(draftId);
  const [draftData, setDraftData] = useState(
    isDraftEdit ? cloneDeep(draftSubmission?.data) : {}
  );
  // deeply clone the draft data to avoid mutating the original object
  const formRef = useRef(isDraftEdit ? { data: cloneDeep(draftSubmission?.data) } : {});
  const [isDraftCreated, setIsDraftCreated] = useState(isDraftEdit);
  const [validFormId, setValidFormId] = useState(undefined);

  const [showPublicForm, setShowPublicForm] = useState("checking");
  const [poll, setPoll] = useState(DRAFT_ENABLED);
  const exitType = useRef("UNMOUNT");

  const {
    isAuthenticated,
    submission,
    onSubmit,
    onCustomEvent,
    errors,
    options,
    form: { form, isActive, url, error },
  } = props;

  const [isValidResource, setIsValidResource] = useState(false);

  const dispatch = useDispatch();
  /*
  Selecting which endpoint to use based on authentication status,
  public endpoint or authenticated endpoint.
  */
  const draftCreateMethod = isAuthenticated ? draftCreate : publicDraftCreate;
  const draftUpdateMethod = isAuthenticated ? draftUpdate : publicDraftUpdate;

  const getPublicForm = useCallback(
    (form_id, isObjectId, formObj) => {
      dispatch(setPublicStatusLoading(true));
      dispatch(
        publicApplicationStatus(form_id, (err) => {
          dispatch(setPublicStatusLoading(false));
          if (!err) {
            if (isPublic) {
              if (isObjectId) {
                dispatch(getForm("form", form_id));
                dispatch(setFormStatusLoading(false));
              } else {
                dispatch(
                  setFormRequestData(
                    "form",
                    form_id,
                    `${Formio.getProjectUrl()}/form/${form_id}`
                  )
                );
                dispatch(setFormSuccessData("form", formObj));
                dispatch(setFormStatusLoading(false));
              }
            }
          }
        })
      );
    },
    [dispatch, isPublic]
  );
  const getFormData = useCallback(() => {
    const isObjectId = checkIsObjectId(formId);
    if (isObjectId) {
      getPublicForm(formId, isObjectId);
      setValidFormId(formId);
    } else {
      dispatch(
        fetchFormByAlias(formId, async (err, formObj) => {
          if (!err) {
            const form_id = formObj._id;
            getPublicForm(form_id, isObjectId, formObj);
            setValidFormId(form_id);
          } else {
            dispatch(setFormFailureErrorData("form", err));
          }
        })
      );
    }
  }, [formId, dispatch, getPublicForm]);
  /**
   * Compares the current form data and last saved data
   * Draft is updated only if the form is updated from the last saved form data.
   */
  const saveDraft = (payload, exitType) => {
    if (exitType === "SUBMIT") return;
    let dataChanged = !isEqual(payload?.data, draftSubmission?.data);
    if (draftSubmissionId && isDraftCreated) {
      if (dataChanged) {
        dispatch(
          draftUpdateMethod(payload, draftSubmissionId, (err) => {
            if (exitType === "UNMOUNT" && !err && isAuthenticated) {
              toast.success(t("Submission saved to draft."));
            }
          })
        );
      }
    }
  };

  useEffect(() => {
    if (form._id && !error) setIsValidResource(true);
    return () => setIsValidResource(false);
  }, [error, form._id]);

  /**
   * Will create a draft application when the form is selected for entry.
   */
  useEffect(() => {
    if (
      validFormId &&
      DRAFT_ENABLED &&
      isValidResource &&
      !isDraftEdit &&
      ((isAuthenticated && formStatus === "active") ||
        (!isAuthenticated && publicFormStatus?.status == "active"))
    ) {
      let payload = getDraftReqFormat(validFormId, draftData?.data);
      dispatch(draftCreateMethod(payload, setIsDraftCreated));
    }
  }, [validFormId, formStatus, publicFormStatus, isValidResource]);

  /**
   * We will repeatedly update the current state to draft table
   * on purticular interval
   */
  useInterval(
    () => {
      let payload = getDraftReqFormat(validFormId, { ...draftData?.data });
      saveDraft(payload);
    },
    poll ? DRAFT_POLLING_RATE : null
  );

  /**
   * Save the current state when the component unmounts.
   * Save the data before submission to handle submission failure.
   */
  useEffect(() => {
    return () => {
      let payload = getDraftReqFormat(validFormId, formRef.current?.data);
      if (poll) saveDraft(payload, exitType.current);
    };
  }, [validFormId, draftSubmissionId, poll, isDraftCreated, exitType.current]);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(setFormStatusLoading(true));
      dispatch(
        getFormProcesses(formId, (err, data) => {
          if (!err) {
            dispatch(getApplicationCount(data.id));
            setFormStatus(data.status);
            dispatch(setFormStatusLoading(false));
          } else {
            dispatch(setFormStatusLoading(false));
          }
        })
      );
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isPublic) {
      getFormData();
    } else {
      setValidFormId(formId);
    }
  }, [isPublic, dispatch, getFormData]);

  useEffect(() => {
    if (publicFormStatus) {
      if (
        publicFormStatus.anonymous === true &&
        publicFormStatus.status === "active"
      ) {
        setShowPublicForm(true);
      } else {
        setShowPublicForm(false);
      }
    }
  }, [publicFormStatus]);

  useEffect(() => {
    if (pubSub.publish) {
      pubSub.publish("ES_FORM", form);
    }
  }, [form, pubSub.publish]);

  // EHR Integration: Fetch patient data when form is loaded and isEHR is true
  useEffect(() => {
    if (!form?._id || !isPublic) return;
    
    const queryParams = new URLSearchParams(location.search);
    const isEHR = queryParams.get('isEHR') === 'true' || queryParams.get('isEHR') === '';
    
    if (!isEHR) return;
    
    // Get SMART config
    const smartConfig = getSMARTConfig();
    
    if (!smartConfig.clientId) {
      debugWarn("EHR Integration: SMART client ID not configured");
      return;
    }
    
    debugLog("=== Starting EHR Integration ===");
    setEhrError(null);
    
    // Call launchSMART - it may return null, a Promise, or redirect
    const smartClientPromise = launchSMART(
      smartConfig.clientId,
      smartConfig.redirectUri,
      smartConfig.scope
    );
    
    // If launchSMART returns null, it means no EHR launch context - silently skip
    if (!smartClientPromise) {
      debugLog("No EHR launch context available, form will load without patient data");
      return;
    }
    
    // Handle the promise (launchSMART is async and may redirect, 
    // so this might not execute)
    Promise.resolve(smartClientPromise)
      .then((fhirClient) => {
        if (!fhirClient) {
          debugLog("SMART client not available, form will load without patient data");
          return;
        }
        debugLog("SMART client initialized");
        return fetchPatientData(fhirClient);
      })
      .then((patientData) => {
        if (!patientData) {
          return;
        }
        debugLog("Patient data fetched:", patientData.patient);
        // Clear any previous errors since we successfully fetched patient data
        setEhrError(null);
        
        // Map patient demographics to form fields
        const mappedData = mapPatientToFormio(patientData.patient, form);
        debugLog("Mapped form data:", mappedData);
        
        // Create submission object for Form.io
        const submissionData = {
          data: mappedData
        };
        
        debugLog("Setting EHR submission:", submissionData);
        setEhrSubmission(submissionData);
        
        // If form is already rendered, update it directly
        if (formRef.current) {
          debugLog("Form already rendered, updating submission directly");
          const mergedData = { ...formRef.current.data, ...mappedData };
          formRef.current.data = mergedData;
          formRef.current.submission = { data: mergedData };
        }
      })
      .catch((err) => {
        debugError("Error fetching patient data from EHR:", err);
        // Only show error if it's not a "must be launched from Epic" error when we have isEHR
        // This error is shown during initial launch setup, not when patient data fetch fails
        const errorMessage = err.message || "Failed to fetch patient data from EHR system";
        if (errorMessage.includes("must be launched from Epic")) {
          // This is expected during initial launch - don't show error
          debugLog("EHR launch in progress, waiting for OAuth redirect...");
          return;
        }
        // Don't set error if it's a redirect (which means OAuth is in progress)
        if (errorMessage.includes("redirect") || errorMessage.includes("OAuth")) {
          debugLog("EHR OAuth flow in progress...");
          return;
        }
        setEhrError(errorMessage);
      });
  }, [form?._id, isPublic, location.search]);

  // Update form when EHR submission data is available
  useEffect(() => {
    if (ehrSubmission && formRef.current) {
      debugLog("EHR submission updated, applying to form:", ehrSubmission);
      const mergedData = { ...formRef.current.data, ...ehrSubmission.data };
      formRef.current.data = mergedData;
      formRef.current.submission = { data: mergedData };
      
      // Try to set values directly on components
      if (formRef.current.setValue && ehrSubmission.data) {
        Object.keys(ehrSubmission.data).forEach(key => {
          const component = formRef.current.getComponent(key);
          if (component && ehrSubmission.data[key]) {
            component.setValue(ehrSubmission.data[key], { modified: false });
          }
        });
      }
    }
  }, [ehrSubmission]);

  // will be updated once application/draft listing page is ready
  const handleBack = () => {
    navigateToFormEntries(dispatch, tenantKey, parentFormId || formId);

  };

  const redirectBackToForm = () => {
    navigateToSubmitFormsListing(dispatch, tenantKey);
  };

  const breadcrumbItems = [
    { id:"submit", label: t("Submit")},
    { id:"form-title", label: form.title}
  ];

  const handleBreadcrumbClick = (item) => {
  if (item.id === "submit") {
      redirectBackToForm();
  }else if (item.id === "form-title") {
      handleBack();
  }
  };

  if (isActive || isPublicStatusLoading || formStatusLoading) {
    return (
      <div data-testid="loading-view-component">
        <Loading />
      </div>
    );
  }

  if (isFormSubmitted && !isAuthenticated) {
    return (
      <div className="text-center pt-5">
        <h1>{t("Thank you for your response.")}</h1>
        <p>{t("saved successfully")}</p>
      </div>
    );
  }

  if (isPublic && !showPublicForm) {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        {t("Form not available")}
      </div>
    );
  }

  return (
    <>
        <div className="header-section-1">
            <div className="section-seperation-left d-block">
                <BreadCrumbs 
                  items={breadcrumbItems}
                  variant={BreadcrumbVariant.MINIMIZED}
                  underline 
                  onBreadcrumbClick={handleBreadcrumbClick}
                /> 
                <h4>{draftSubmission?.isDraft ? draftId : t("New Submission")}</h4>
            </div>
        </div>

      <Errors errors={errors} />
      <LoadingOverlay
        active={isFormSubmissionLoading}
        spinner
        text={<Translation>{(t) => t("Loading...")}</Translation>}
        className="col-12"
      >
        <div className="body-section px-1">
          {ehrError && (
            <div className="alert alert-warning mb-3" role="alert">
              <strong>EHR Integration Warning:</strong> {ehrError}
              <br />
              <small>The form will be displayed without pre-filled patient data.</small>
            </div>
          )}
          {(isPublic || formStatus === "active") ? (
            <Form
              form={form}
              submission={(() => {
                // Priority: draft data > EHR submission > regular submission
                if (isDraftEdit && draftData) {
                  return draftData;
                }
                if (ehrSubmission) {
                  // Merge EHR data with existing submission if any
                  const baseSubmission = submission || { data: {} };
                  return {
                    ...baseSubmission,
                    data: { ...baseSubmission.data, ...ehrSubmission.data }
                  };
                }
                return submission;
              })()}
              url={url}
              options={{
                ...options,
                language: lang ?? "en",
                i18n: RESOURCE_BUNDLES_DATA,
                buttonSettings: { showCancel: false },
              }}
              onChange={() => {
                if (formRef.current?.data) {
                  setDraftData({ data: formRef.current?.data });
                }
              }}
              formReady={(e) => {
                formRef.current = e;
                // If we have EHR submission data, apply it to the form
                if (ehrSubmission && e) {
                  debugLog("Form ready, applying EHR submission:", ehrSubmission);
                  const mergedData = { ...e.data, ...ehrSubmission.data };
                  e.data = mergedData;
                  e.submission = { data: mergedData };
                  
                  // Set values on individual components
                  if (e.setValue && ehrSubmission.data) {
                    Object.keys(ehrSubmission.data).forEach(key => {
                      const component = e.getComponent(key);
                      if (component && ehrSubmission.data[key]) {
                        component.setValue(ehrSubmission.data[key], { modified: false });
                      }
                    });
                  }
                }
              }}
              onSubmit={(data) => {
                setPoll(false);
                exitType.current = "SUBMIT";
                onSubmit(data, form._id, draftId, isPublic);
              }}
              onCustomEvent={(evt) => onCustomEvent(evt, redirectUrl)}
            />
          ) : (
            renderPage(formStatus, processLoadError)
          )}
        </div>
      </LoadingOverlay>
      </>
  );
});

// eslint-disable-next-line no-unused-vars
const doProcessActions = (submission, draftId, ownProps, formId) => {
  return (dispatch, getState) => {
    const state = getState();
    let form = state.form?.form;
    let isAuth = state.user.isAuthenticated;
    const tenantKey = state.tenants?.tenantId;
    const redirectUrl = MULTITENANCY_ENABLED ? `/tenant/${tenantKey}/` : `/`;
    const origin = `${window.location.origin}${redirectUrl}`;
    let parentFormId = form?.parentFormId || form?._id; 
    dispatch(resetSubmissions("submission"));
    const data = getProcessReq(form, submission._id, origin, submission?.data);
    //To Be Done need to detail test of draft for public user and authenticated user
    const draftIdToUse = isAuth ? draftId || state.draft?.draftSubmission?.applicationId : draftId;
    let isDraftCreated = Boolean(draftIdToUse);
    const applicationCreateAPI = selectApplicationCreateAPI(
      isAuth,
      isDraftCreated,
      DRAFT_ENABLED
    );


    dispatch(
      applicationCreateAPI(data, draftIdToUse, (err) => {
        dispatch(setFormSubmissionLoading(false));
        if (!err) {
          toast.success(<Translation>{(t) => t("Submission Saved")}</Translation>);
          dispatch(setFormSubmitted(true));
          if (isAuth) {
            dispatch(setMaintainBPMFormPagination(true));
            navigateToFormEntries(dispatch, tenantKey, parentFormId);
          }
        } else {
          toast.error(<Translation>{(t) => t("Submission Failed.")}</Translation>);
        }
      })
    );
  };
};


const mapStateToProps = (state) => {
  return {
    user: state.user.userDetail,
    tenant: state?.tenants?.tenantId,
    form: selectRoot("form", state),
    isAuthenticated: state.user.isAuthenticated,
    errors: [selectError("form", state), selectError("submission", state)],
    options: {
      noAlerts: false,
      i18n: {
        en: {
          error: <Translation>{(t) => t("Message")}</Translation>,
        },
      },
    },
    submissionError: selectRoot("formDelete", state).formSubmissionError,
  };
};

View.propTypes = {
  form: PropTypes.object,
  isAuthenticated: PropTypes.bool,
  errors: PropTypes.array,
  options: PropTypes.object,
  submissionError: PropTypes.object,
  onSubmit: PropTypes.func,
  onConfirm: PropTypes.func,
  submission: PropTypes.object,
  onCustomEvent: PropTypes.func,
};

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSubmit: (submission, formId, draftId, isPublic) => {
      dispatch(setFormSubmissionLoading(true));
      // this is callback function for submission
      const callBack = (err, submission) => {
        if (!err) {
          dispatch(doProcessActions(submission, draftId, ownProps, formId));
        } else {
          const ErrorDetails = {
            modalOpen: true,
            message: (
              <Translation>
                {(t) => t("Submission cannot be done.")}
              </Translation>
            ),
          };
          toast.error(
            <Translation>{(t) => t("Error while Submission.")}</Translation>
          );
          dispatch(setFormSubmissionLoading(false));
          dispatch(setFormSubmissionError(ErrorDetails));
        }
      };
      if (CUSTOM_SUBMISSION_URL && CUSTOM_SUBMISSION_ENABLE) {
        postCustomSubmission(submission, formId, isPublic, callBack);
      } else {
        dispatch(saveSubmission("submission", submission, formId, callBack));
      }
    },
    onCustomEvent: (customEvent, redirectUrl) => {
      switch (customEvent.type) {
        case CUSTOM_EVENT_TYPE.CUSTOM_SUBMIT_DONE:
          toast.success(
            <Translation>{(t) => t("Submission Saved")}</Translation>
          );
          dispatch(push(`${redirectUrl}form`));
          break;
        case CUSTOM_EVENT_TYPE.CANCEL_SUBMISSION:
          dispatch(push(`${redirectUrl}form`));
          break;
        default:
          return;
      }
    },
    onConfirm: () => {
      const ErrorDetails = { modalOpen: false, message: "" };
      dispatch(setFormSubmissionError(ErrorDetails));
    },
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(View);
