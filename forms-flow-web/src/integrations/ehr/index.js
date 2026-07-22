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

// IMPORTANT: Set up interceptors FIRST, before any other imports
// This ensures they're active before fhirclient makes any requests

// Global JSON.parse wrapper to catch HTML being parsed as JSON
// Must run immediately, before any other code
if (typeof window !== 'undefined' && typeof JSON !== 'undefined') {
  const originalParse = JSON.parse;
  if (originalParse && !JSON.parse._patched) {
    // #region agent log
    console.log('[EHR] JSON.parse interceptor installed');
    // #endregion
    JSON.parse = function(text, reviver) {
      try {
        // Check if the text looks like HTML before parsing
        if (typeof text === 'string') {
          const trimmed = text.trim();
          if (trimmed.toLowerCase().startsWith('<!doctype') || 
              trimmed.toLowerCase().startsWith('<html') ||
              trimmed.toLowerCase().startsWith('<!html')) {
            throw new Error(
              `Attempted to parse HTML as JSON. ` +
              `The response appears to be HTML (starts with "${trimmed.substring(0, 20)}...") ` +
              `instead of JSON. This usually means a server endpoint returned an error page.`
            );
          }
        }
        
        return originalParse.call(this, text, reviver);
      } catch (error) {
        const errorMsg = error?.message || String(error);
        
        // If it's the "Unexpected token" error, provide better context
        if (errorMsg.includes('Unexpected token') && errorMsg.includes('<')) {
          const trimmed = typeof text === 'string' ? text.trim() : String(text);
          const friendlyError = new Error(
            `Failed to parse JSON - received HTML instead. ` +
            `The response starts with "${trimmed.substring(0, 50)}..." ` +
            `which indicates the server returned an HTML error page instead of JSON. ` +
            `Original error: ${errorMsg}`
          );
          friendlyError.originalError = error;
          throw friendlyError;
        }
        
        // Re-throw other errors
        throw error;
      }
    };
    JSON.parse._patched = true;
  }
}

// Global fetch interceptor to catch HTML responses being parsed as JSON
// Must run immediately, before any other code
if (typeof window !== 'undefined') {
  // Patch Response prototype to intercept json() calls globally
  if (typeof Response !== 'undefined' && Response.prototype) {
    const originalJson = Response.prototype.json;
    if (originalJson && !Response.prototype.json._patched) {
      // #region agent log
      console.log('[EHR] Response.prototype.json interceptor installed');
      // #endregion
      Response.prototype.json = function() {
        const response = this;
        const originalJsonBound = originalJson.bind(response);
        
        return originalJsonBound().catch(async (error) => {
          const errorMsg = error?.message || String(error);
          
          // Check if this is a JSON parse error (HTML response)
          if (errorMsg.includes('JSON') || 
              errorMsg.includes('<!doctype') || 
              errorMsg.includes('Unexpected token') ||
              errorMsg.includes('Unexpected token <')) {
            
            // Try to get the response text to confirm it's HTML
            try {
              const cloned = response.clone();
              const text = await cloned.text();
              const isHtml = text.trim().toLowerCase().startsWith('<!doctype') || 
                            text.trim().toLowerCase().startsWith('<html') ||
                            text.trim().toLowerCase().startsWith('<!html');
              
              if (isHtml) {
                const url = response.url || 'unknown';
                const friendlyError = new Error(
                  `FHIR server returned HTML instead of JSON. ` +
                  `URL: ${url}, Status: ${response.status} ${response.statusText}. ` +
                  `This usually means the endpoint is incorrect or the server ` +
                  `returned an error page.`
                );
                friendlyError.response = response;
                friendlyError.url = url;
                friendlyError.status = response.status;
                throw friendlyError;
              }
            } catch (checkError) {
              // If we can't check, just provide a better error message
            }
            
            // Provide a helpful error even if we couldn't confirm it's HTML
            const url = response.url || 'unknown';
            const friendlyError = new Error(
              `Failed to parse JSON response. ` +
              `URL: ${url}, Status: ${response.status}. ` +
              `The server may have returned HTML instead of JSON. ` +
              `Original error: ${errorMsg.substring(0, 100)}`
            );
            friendlyError.originalError = error;
            friendlyError.url = url;
            friendlyError.status = response.status;
            throw friendlyError;
          }
          
          // Re-throw non-JSON errors
          throw error;
        });
      };
      Response.prototype.json._patched = true;
    }
  }
}

import { isEhrEnabled } from './config';

// Re-export all public APIs
export { isEhrEnabled, getSMARTConfig, debugError, debugWarn } from './config';
export { launchSMART, fetchPatientData, getPatient } from './service';
export { mapPatientToFormio } from './mapper';
export { useEhrPatientData } from './hooks';

// Global fetch interceptor to catch HTML responses being parsed as JSON
if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
  const originalFetch = window.fetch;
  
  // #region agent log
  console.log('[EHR] Fetch interceptor installed');
  // #endregion
  
  window.fetch = async function(...args) {
    const url = args[0];
    const isFhirRequest = typeof url === 'string' && (
      url.includes('fhir') || 
      url.includes('smart') || 
      url.includes('oauth') ||
      url.includes('epic') ||
      url.includes('token') ||
      url.includes('authorize')
    );
    
    const response = await originalFetch.apply(this, args);
    
    // For FHIR-related requests, wrap the response to intercept JSON parsing
    if (isFhirRequest) {
      // Wrap the json() method to catch HTML responses
        response.json = async function() {
          try {
            // Clone to check content without consuming the original
            const clonedResponse = response.clone();
            const text = await clonedResponse.text();
            
            // Check if the response is HTML
            const isHtml = text.trim().toLowerCase().startsWith('<!doctype') || 
                          text.trim().toLowerCase().startsWith('<html') ||
                          text.trim().toLowerCase().startsWith('<!html');
            
            if (isHtml) {
              // Throw a more helpful error instead of letting JSON.parse fail
              const error = new Error(
                `FHIR server returned HTML instead of JSON. ` +
                `URL: ${typeof url === 'string' ? url : 'unknown'}, ` +
                `Status: ${response.status} ${response.statusText}. ` +
                `This usually means the endpoint is incorrect or the server returned an error page.`
              );
              error.response = response;
              error.url = url;
              error.status = response.status;
              throw error;
            }
            
            // If not HTML, parse as JSON
            try {
              return JSON.parse(text);
            } catch (parseError) {
              // If JSON.parse fails, provide better context
              const errorMsg = parseError?.message || String(parseError);
              const friendlyError = new Error(
                `Failed to parse JSON response from FHIR server. ` +
                `URL: ${typeof url === 'string' ? url : 'unknown'}, ` +
                `Status: ${response.status}. ` +
                `The server may have returned invalid JSON or HTML. ` +
                `Original error: ${errorMsg.substring(0, 100)}`
              );
              friendlyError.originalError = parseError;
              friendlyError.url = url;
              friendlyError.status = response.status;
              throw friendlyError;
            }
          } catch (error) {
            // If it's already our custom error, re-throw it
            if (error.message && (error.message.includes('FHIR server returned HTML') || error.message.includes('Failed to parse JSON'))) {
              throw error;
            }
            
            // Re-throw other errors
            throw error;
          }
        };
      }
      
      return response;
  };
}

// Global error handler for unhandled promise rejections from fhirclient
if (typeof window !== 'undefined') {
  // #region agent log
  console.log('[EHR] Unhandled rejection handler installed');
  // #endregion
  
  const originalHandler = window.onunhandledrejection;
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    const errorMessage = error?.message || String(error);
    
    // Check if this is a JSON parse error
    if (errorMessage.includes('JSON') || 
        errorMessage.includes('<!doctype') || 
        errorMessage.includes('Unexpected token') ||
        errorMessage.includes('Unexpected token <')) {
      // #region agent log
      console.error('[EHR] Caught JSON parse error in unhandled rejection:', {
        error: errorMessage.substring(0, 200),
        url: error?.url || 'unknown',
        stack: error?.stack?.substring(0, 300)
      });
      // #endregion
      
      // Prevent default console error, we'll handle it
      event.preventDefault();
      
      // Log a more helpful error
      console.error(
        'EHR Integration: FHIR server returned HTML instead of JSON. ' +
        'This usually means the server endpoint is incorrect or the server is down.',
        error
      );
    } else if (originalHandler) {
      // Call original handler if it exists
      originalHandler(event);
    }
  });
}

// Default export with feature flag check
const ehrIntegration = {
  isEnabled: isEhrEnabled()
};

export default ehrIntegration;
