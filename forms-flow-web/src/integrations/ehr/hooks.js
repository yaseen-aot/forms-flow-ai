/**
 * React Hooks for EHR Integration
 * Provides easy-to-use hooks for integrating EHR functionality into React components
 */

import { useState, useEffect, useCallback } from 'react';
import { isEhrEnabled, getSMARTConfig, debugLog, debugError, debugWarn } from './config';
import { launchSMART, fetchPatientData } from './service';
import { mapPatientToFormio } from './mapper';

/**
 * Hook to fetch and map patient data from EHR
 * Automatically handles SMART launch and patient data fetching
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.form - Form.io form schema (optional, for better field mapping)
 * @param {boolean} options.autoFetch - Whether to automatically fetch on mount (default: true)
 * @returns {Object} Hook result with patient data, loading state, and error
 */
export function useEhrPatientData({ form = null, autoFetch = true } = {}) {
  const [patientData, setPatientData] = useState(null);
  const [mappedData, setMappedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    // Check if EHR is enabled
    if (!isEhrEnabled()) {
      debugLog('EHR integration is disabled');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get SMART configuration
      const smartConfig = getSMARTConfig();
      
      if (!smartConfig.clientId) {
        debugWarn('EHR Integration: SMART client ID not configured');
        setError('EHR integration is not properly configured');
        setLoading(false);
        return;
      }

      debugLog('EHR context detected - fetching patient data');
      
      // Launch SMART client
      const smartClientPromise = launchSMART(
        smartConfig.clientId,
        smartConfig.redirectUri,
        smartConfig.scope
      );
      
      // If launchSMART returns null, it means no EHR launch context
      if (!smartClientPromise) {
        debugLog('No EHR launch context available, form will load without patient data');
        setLoading(false);
        return;
      }
      
      // Handle the promise
      const fhirClient = await Promise.resolve(smartClientPromise);
      
      if (!fhirClient) {
        debugLog('SMART client not available, form will load without patient data');
        setLoading(false);
        return;
      }

      debugLog('SMART client initialized');
      
      // Fetch patient data
      const data = await fetchPatientData(fhirClient);
      
      if (!data || !data.patient) {
        throw new Error('No patient data received from EHR');
      }

      debugLog('Patient data fetched:', data.patient);
      
      // Store raw patient data
      setPatientData(data.patient);
      setError(null);
    } catch (err) {
      debugError('Error fetching patient data from EHR:', err);
      
      // Only set error if it's not a redirect/OAuth flow error
      const errorMessage = err.message || 'Failed to fetch patient data from EHR system';
      if (!errorMessage.includes('must be launched from Epic') && 
          !errorMessage.includes('redirect') && 
          !errorMessage.includes('OAuth')) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Map patient data to form fields whenever patient data or form changes
  useEffect(() => {
    if (patientData) {
      debugLog('Mapping patient data to form fields, form available:', !!form);
      const mapped = mapPatientToFormio(patientData, form);
      
      // Filter out non-primitive values
      const filteredMapped = {};
      Object.keys(mapped).forEach(key => {
        const value = mapped[key];
        if (value !== null && value !== undefined && typeof value !== 'object') {
          filteredMapped[key] = typeof value === 'string' ? value : String(value);
        }
      });
      
      debugLog('Mapped data:', filteredMapped);
      setMappedData(filteredMapped);
    }
  }, [patientData, form]);

  useEffect(() => {
    if (autoFetch && isEhrEnabled()) {
      // Check URL parameters first and store them in sessionStorage if present
      const urlParams = new URLSearchParams(window.location.search);
      const urlIsEHR = urlParams.get('isEHR');
      const urlCode = urlParams.get('code');
      const urlState = urlParams.get('state');
      const urlIss = urlParams.get('iss');
      const urlLaunch = urlParams.get('launch');
      
      // Store URL parameters in sessionStorage if they exist
      if (urlIsEHR) {
        sessionStorage.setItem('epic_isEHR', urlIsEHR);
      }
      if (urlCode) {
        sessionStorage.setItem('epic_code', urlCode);
      }
      if (urlState) {
        sessionStorage.setItem('epic_state', urlState);
      }
      if (urlIss) {
        sessionStorage.setItem('epic_iss', urlIss);
      }
      if (urlLaunch) {
        sessionStorage.setItem('epic_launch', urlLaunch);
      }
      
      // Check session storage for EHR launch parameters (now includes URL params)
      const storedIss = sessionStorage.getItem('epic_iss');
      const storedCode = sessionStorage.getItem('epic_code');
      const storedLaunch = sessionStorage.getItem('epic_launch');
      const storedIsEHR = sessionStorage.getItem('epic_isEHR');
      
      // Has EHR context if we have iss and (code OR launch) in session storage, OR isEHR flag
      // OR if URL has isEHR=true with code/state parameters
      const hasEhrContext = storedIsEHR === 'true' || 
                           (storedIss && (storedCode || storedLaunch)) ||
                           (urlIsEHR === 'true' && (urlCode || urlState));
      
      if (hasEhrContext) {
        debugLog('EHR context detected, fetching patient data', {
          storedIsEHR,
          storedIss: !!storedIss,
          storedCode: !!storedCode,
          storedLaunch: !!storedLaunch,
          urlIsEHR,
          urlCode: !!urlCode,
          urlState: !!urlState
        });
        fetchData();
      } else {
        debugLog('No EHR context detected - skipping patient data fetch');
      }
    }
  }, [autoFetch, fetchData]);

  return {
    patientData,
    mappedData,
    loading,
    error,
    refetch: fetchData
  };
}
