/**
 * EHR Service
 * Handles SMART on FHIR authentication and patient data fetching
 * Based on the Foundry project implementation
 */

import { debugLog, debugError, debugWarn } from './ehrConfig';

/**
 * Initialize and launch SMART on FHIR client
 * Handles OAuth2 authentication flow
 * 
 * @param {string} clientId - SMART app client ID
 * @param {string} redirectUri - OAuth redirect URI
 * @param {string} scope - OAuth scopes
 * @returns {Promise<Object>} Configured FHIR client
 */
export async function launchSMART(clientId, redirectUri, scope) {
  try {
    // Dynamic import of fhirclient to avoid issues if not installed
    let BrowserAdapter, ready;
    try {
      const browserAdapterModule = await import('fhirclient/lib/adapters/BrowserAdapter');
      const smartModule = await import('fhirclient/lib/smart');
      
      // BrowserAdapter is a default export, so access via .default
      BrowserAdapter = browserAdapterModule.default;
      ready = smartModule.ready;
      
      if (!BrowserAdapter || typeof BrowserAdapter !== 'function') {
        debugError('BrowserAdapter module:', browserAdapterModule);
        throw new Error('BrowserAdapter is not available or not a constructor');
      }
      if (!ready || typeof ready !== 'function') {
        debugError('smart module:', smartModule);
        throw new Error('ready function is not available');
      }
    } catch (importError) {
      debugError('Error importing fhirclient:', importError);
      const errorMsg = `fhirclient package is not installed or import failed: ` +
        `${importError.message}. Please install it using: npm install fhirclient`;
      throw new Error(errorMsg);
    }
    
    // Create browser adapter instance
    const adapter = new BrowserAdapter();
    
    // Check URL parameters to understand the launch context
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code'); // OAuth authorization code (after redirect)
    const state = urlParams.get('state'); // OAuth state (after redirect)
    const iss = urlParams.get('iss'); // Issuer from URL (not sessionStorage to avoid loops)
    const launch = urlParams.get('launch'); // Launch parameter from URL
    
    // If we have OAuth code/state, proceed with authentication (OAuth flow completed)
    if (code || state) {
      // OAuth redirect completed - proceed with authentication
      // Get iss/launch from sessionStorage if needed
      const storedIss = sessionStorage.getItem('epic_iss');
      const storedLaunch = sessionStorage.getItem('epic_launch');
      
      // Prepare ready options
      const readyOptions = {
        clientId: clientId,
        scope: scope,
        redirectUri: redirectUri
      };
      
      // Include iss and launch if available (from sessionStorage)
      if (storedIss && storedLaunch) {
        readyOptions.iss = storedIss;
        readyOptions.launch = storedLaunch;
      }
      
      // Call the ready function with adapter and options
      const fhirClient = await ready(adapter, readyOptions);
      return fhirClient;
    }
    
    // If we have iss and launch but no code, redirect to launch.html to start OAuth
    if (iss && launch && !code) {
      // Preserve query params for redirect
      const currentSearch = window.location.search;
      const encodedIss = encodeURIComponent(iss);
      const encodedLaunch = encodeURIComponent(launch);
      
      // Build launch.html URL with all necessary parameters
      let launchUrl = `/launch.html?iss=${encodedIss}&launch=${encodedLaunch}`;
      
      // Pass config as URL parameters so launch.html can use them
      if (clientId) {
        launchUrl += `&clientId=${encodeURIComponent(clientId)}`;
      }
      if (redirectUri) {
        launchUrl += `&redirectUri=${encodeURIComponent(redirectUri)}`;
      }
      if (scope) {
        launchUrl += `&scope=${encodeURIComponent(scope)}`;
      }
      
      if (currentSearch) {
        // Preserve isEHR and other query params (but avoid duplicating iss/launch)
        const params = new URLSearchParams(currentSearch);
        params.delete('iss');
        params.delete('launch');
        const remainingParams = params.toString();
        if (remainingParams) {
          launchUrl += `&${remainingParams}`;
        }
      }
      
      window.location.href = launchUrl;
      return; // Exit early, redirect will happen
    }
    
    // If we don't have OAuth state and no launch parameters, check if isEHR is set
    const isEHR = urlParams.get('isEHR') === 'true' || urlParams.get('isEHR') === '';
    
    // If isEHR is set but we don't have launch parameters, allow form to load without patient data
    // This prevents redirect loops when OAuth has completed but parameters are missing
    if (isEHR && !iss && !launch) {
      // Check if we might have OAuth params in sessionStorage (OAuth completed)
      const storedIss = sessionStorage.getItem('epic_iss');
      if (storedIss) {
        // OAuth might have completed - try to proceed with stored params
        const storedLaunch = sessionStorage.getItem('epic_launch');
        if (storedLaunch) {
          const readyOptions = {
            clientId: clientId,
            scope: scope,
            redirectUri: redirectUri,
            iss: storedIss,
            launch: storedLaunch
          };
          const fhirClient = await ready(adapter, readyOptions);
          return fhirClient;
        }
      }
      // No launch parameters available - form can load without patient data
      debugWarn('EHR launch parameters (iss/launch) not found. Form will load without patient data.');
      return null;
    }
    
    // If we have neither OAuth state nor launch parameters, and isEHR is not set,
    // this is not an EHR launch - return null to allow normal form loading
    if (!isEHR) {
      return null;
    }
    
    // Otherwise, the app was accessed with isEHR but without proper launch context
    const errorMsg = 'This app must be launched from Epic. ' +
      'Please launch it from the Epic sandbox with a patient selected.';
    throw new Error(errorMsg);
  } catch (error) {
    debugError('SMART launch failed:', error);
    throw new Error(`Failed to launch SMART app: ${error.message}`);
  }
}

/**
 * Get the current patient from the FHIR client
 * 
 * @param {Object} client - FHIR client instance
 * @returns {Promise<Object>} Patient resource
 */
export async function getPatient(client) {
  try {
    if (!client || !client.patient) {
      throw new Error('No patient context available');
    }
    const patient = await client.patient.read();
    return patient;
  } catch (error) {
    debugError('Error fetching patient:', error);
    throw error;
  }
}

/**
 * Fetch patient demographics information
 * 
 * @param {Object} client - FHIR client instance
 * @param {string} patientId - Optional patient ID for development/testing
 * @returns {Promise<Object>} Patient demographics object
 */
export async function fetchPatientData(client, patientId = null) {
  try {
    if (!client) {
      throw new Error('FHIR client not initialized');
    }

    let patient;
    
    // If a specific patient ID is provided (for development/testing)
    if (patientId) {
      debugLog('Fetching patient with ID:', patientId);
      try {
        // Fetch patient by ID directly
        patient = await client.request(`Patient/${patientId}`);
      } catch (error) {
        const errorMessage = parseFhirError(error);
        if (errorMessage.includes('deleted')) {
          const errorMsg = `Patient ${patientId} has been deleted. ` +
            'Please use a different patient ID or launch from Epic with an active patient.';
          throw new Error(errorMsg);
        }
        throw error;
      }
    } else {
      // Use the patient from launch context
      try {
        patient = await getPatient(client);
      } catch (error) {
        // Parse FHIR errors
        const errorMessage = parseFhirError(error);
        throw new Error(errorMessage);
      }
    }
    
    if (!patient || !patient.id) {
      throw new Error('Patient not found or invalid patient context');
    }

    return {
      patient
    };
  } catch (error) {
    debugError('Error fetching patient data:', error);
    
    // If error message is already user-friendly, use it
    if (error.message && (error.message.includes('deleted') || error.message.includes('not found'))) {
      throw error;
    }
    
    // Otherwise, try to parse FHIR error
    const friendlyMessage = parseFhirError(error);
    throw new Error(friendlyMessage);
  }
}

/**
 * Parse FHIR OperationOutcome error
 * 
 * @param {Object} error - Error object that may contain OperationOutcome
 * @returns {string} User-friendly error message
 */
function parseFhirError(error) {
  // Check if error is a FHIR OperationOutcome
  if (error.resourceType === 'OperationOutcome' && error.issue && error.issue.length > 0) {
    const issue = error.issue[0];
    
    // Check for deleted resource
    if (issue.diagnostics && issue.diagnostics.includes('Resource was deleted')) {
      return 'The patient record has been deleted from the system. Please select a different patient in Epic.';
    }
    
    // Check for not found
    if (issue.code === 'not-found' || issue.diagnostics?.includes('not found')) {
      return 'Patient not found. Please select a different patient in Epic.';
    }
    
    // Return the diagnostics message if available
    if (issue.diagnostics) {
      return issue.diagnostics;
    }
    
    // Return the code if available
    if (issue.code) {
      return `FHIR error: ${issue.code}`;
    }
  }
  
  // Check if error response contains OperationOutcome
  if (error.response && error.response.data) {
    const outcome = error.response.data;
    if (outcome.resourceType === 'OperationOutcome') {
      return parseFhirError(outcome);
    }
  }
  
  // Return original error message
  return error.message || 'Unknown error occurred';
}

