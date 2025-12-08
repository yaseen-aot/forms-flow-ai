/**
 * EHR Configuration Utility
 * Centralized configuration for SMART on FHIR integration
 */

/**
 * Get SMART on FHIR configuration
 * Reads from environment variables or provides defaults
 * 
 * @param {string} formId - Optional form ID for constructing redirect URI
 * @returns {Object} SMART configuration object
 */
export function getSMARTConfig(formId = null) {
  const baseRedirectUri = (window._env_ && window._env_.REACT_APP_SMART_REDIRECT_URI) ||
                          process.env.REACT_APP_SMART_REDIRECT_URI;
  
  // If no explicit redirect URI is set, use current page with formId
  let redirectUri = baseRedirectUri;
  if (!redirectUri && formId) {
    const currentPath = window.location.pathname;
    redirectUri = window.location.origin + currentPath;
  } else if (!redirectUri) {
    redirectUri = window.location.origin + window.location.pathname;
  }
  
  return {
    clientId: (window._env_ && window._env_.REACT_APP_SMART_CLIENT_ID) ||
              process.env.REACT_APP_SMART_CLIENT_ID ||
              '',
    redirectUri: redirectUri,
    scope: (window._env_ && window._env_.REACT_APP_SMART_SCOPE) ||
           process.env.REACT_APP_SMART_SCOPE ||
           'launch launch/patient patient/*.read'
  };
}

/**
 * Check if debug logging should be enabled
 * Based on NODE_ENV or a specific debug flag
 * 
 * @returns {boolean} True if debug logging should be enabled
 */
export function isDebugEnabled() {
  const nodeEnv = (window._env_ && window._env_.NODE_ENV) || 
                  process.env.NODE_ENV || 
                  'development';
  const debugFlag = (window._env_ && window._env_.REACT_APP_EHR_DEBUG) ||
                    process.env.REACT_APP_EHR_DEBUG;
  
  return nodeEnv === 'development' || debugFlag === 'true';
}

/**
 * Debug logger that only logs in development or when debug flag is set
 * 
 * @param {...any} args - Arguments to log
 */
export function debugLog(...args) {
  if (isDebugEnabled()) {
    console.log(...args);
  }
}

/**
 * Debug error logger
 * 
 * @param {...any} args - Arguments to log
 */
export function debugError(...args) {
  if (isDebugEnabled()) {
    console.error(...args);
  }
}

/**
 * Debug warn logger
 * 
 * @param {...any} args - Arguments to log
 */
export function debugWarn(...args) {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
}

