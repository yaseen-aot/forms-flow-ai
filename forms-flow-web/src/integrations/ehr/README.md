# EHR Integration Module

This module provides SMART on FHIR integration for Epic EHR systems. It can be enabled or disabled via environment variables, making it easy to integrate or remove EHR functionality without modifying core formsflow code.

## Features

- **Feature Flag Support**: Enable/disable via `REACT_APP_EHR_ENABLED` environment variable
- **Modular Design**: All EHR-related code is isolated in this module
- **Easy Integration**: Simple import and use in React components
- **SMART on FHIR**: Full support for SMART on FHIR authentication and patient data fetching
- **Form.io Mapping**: Automatic mapping of FHIR Patient resources to Form.io form fields

## Installation

The EHR integration requires the `fhirclient` package:

```bash
npm install fhirclient
```

## Configuration

### Environment Variables

Add the following environment variables to enable EHR integration:

```bash
# Enable EHR integration
REACT_APP_EHR_ENABLED=true

# SMART on FHIR configuration
REACT_APP_SMART_CLIENT_ID=your_client_id
REACT_APP_SMART_REDIRECT_URI=https://your-app.com/public/form/{formId}
REACT_APP_SMART_SCOPE=launch launch/patient patient/*.read

# Optional: Enable debug logging
REACT_APP_EHR_DEBUG=true
```

### Backend Configuration (forms-flow-api)

For the backend API, add:

```bash
# Enable EHR integration
FORMSFLOW_API_EHR_ENABLED=true

# Frame options for iframe embedding (required for SMART on FHIR)
FORMSFLOW_API_FRAME_OPTIONS=ALLOWALL
```

## Usage

### Basic Usage in React Components

```javascript
import { useEhrPatientData, isEhrEnabled } from '../../../integrations/ehr';

function MyFormComponent({ form }) {
  const { mappedData, loading, error } = useEhrPatientData({ form });
  
  if (!isEhrEnabled()) {
    // EHR integration is disabled, render normal form
    return <Form form={form} />;
  }
  
  if (loading) {
    return <div>Loading patient data...</div>;
  }
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  return (
    <Form 
      form={form} 
      submission={mappedData ? { data: mappedData } : null}
    />
  );
}
```

### Manual Integration (Advanced)

If you need more control, you can use the individual functions:

```javascript
import { 
  isEhrEnabled,
  getSMARTConfig,
  launchSMART,
  fetchPatientData,
  mapPatientToFormio,
  debugLog
} from '../../../integrations/ehr';

// Check if enabled
if (!isEhrEnabled()) {
  return;
}

// Get configuration
const config = getSMARTConfig();

// Launch SMART client
const fhirClient = await launchSMART(
  config.clientId,
  config.redirectUri,
  config.scope
);

// Fetch patient data
const patientData = await fetchPatientData(fhirClient);

// Map to form fields
const mappedData = mapPatientToFormio(patientData.patient, form);
```

## Module Structure

```
integrations/ehr/
├── config.js          # Configuration and feature flag checks
├── service.js          # SMART on FHIR authentication and patient fetching
├── mapper.js           # FHIR Patient to Form.io field mapping
├── hooks.js            # React hooks for easy integration
├── index.js            # Main export file
└── README.md           # This file
```

## API Reference

### Functions

#### `isEhrEnabled()`
Returns `true` if EHR integration is enabled, `false` otherwise.

#### `getSMARTConfig(formId?)`
Returns SMART on FHIR configuration object with `clientId`, `redirectUri`, and `scope`.

#### `launchSMART(clientId, redirectUri, scope)`
Launches SMART on FHIR client and handles OAuth flow. Returns a Promise that resolves to a FHIR client or `null` if no EHR context is available.

#### `fetchPatientData(client, patientId?)`
Fetches patient data from the FHIR client. Returns a Promise that resolves to `{ patient }`.

#### `mapPatientToFormio(patient, form?)`
Maps FHIR Patient resource to Form.io form data structure. Returns an object with mapped field values.

### React Hooks

#### `useEhrPatientData({ form?, autoFetch? })`
React hook that automatically fetches and maps patient data.

**Parameters:**
- `form` (optional): Form.io form schema for better field mapping
- `autoFetch` (optional): Whether to automatically fetch on mount (default: `true`)

**Returns:**
- `patientData`: Raw FHIR Patient resource
- `mappedData`: Mapped form data object
- `loading`: Loading state
- `error`: Error message if any
- `refetch`: Function to manually trigger data fetch

## Disabling EHR Integration

To disable EHR integration:

1. Set `REACT_APP_EHR_ENABLED=false` (or remove the variable)
2. Set `FORMSFLOW_API_EHR_ENABLED=false` in backend
3. The integration code will be skipped automatically

No code changes are required - the feature flag checks ensure the integration is completely bypassed when disabled.

## Launch.html

The `launch.html` file in `forms-flow-web-root-config/public/` handles the SMART on FHIR OAuth redirect flow. This file should remain in the public directory and does not need to be moved.

## Troubleshooting

### Patient data not loading
- Check that `REACT_APP_EHR_ENABLED=true`
- Verify SMART client ID is configured
- Check browser console for debug messages (enable `REACT_APP_EHR_DEBUG=true`)
- Verify launch parameters are in session storage

### Form fields not being populated
- Check that form field keys match the expected naming patterns
- Enable debug logging to see mapping results
- Verify patient data is being fetched correctly

### OAuth redirect issues
- Verify redirect URI matches what's registered in SMART Health IT
- Check that `launch.html` is accessible
- Ensure CORS and frame options are configured correctly

## Support

For issues or questions about the EHR integration, please refer to the main formsflow documentation or contact the development team.
