/**
 * EHR Integration Module
 * 
 * This module provides SMART on FHIR integration for Epic EHR systems.
 * It can be enabled/disabled via the REACT_APP_EHR_ENABLED environment variable.
 * 
 * Usage:
 *   import { useEhrPatientData, isEhrEnabled } from '@integrations/ehr';
 * 
 *   const { mappedData, loading, error } = useEhrPatientData({ form });
 */

import { isEhrEnabled } from './config';

// Re-export all public APIs
export { isEhrEnabled, getSMARTConfig, debugLog, debugError, debugWarn } from './config';
export { launchSMART, fetchPatientData, getPatient } from './service';
export { mapPatientToFormio } from './mapper';
export { useEhrPatientData } from './hooks';

// Default export with feature flag check
const ehrIntegration = {
  isEnabled: isEhrEnabled()
};

export default ehrIntegration;
