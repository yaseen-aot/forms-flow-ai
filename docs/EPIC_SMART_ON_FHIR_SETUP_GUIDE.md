# Epic SMART on FHIR Integration Setup Guide

This guide provides step-by-step instructions for setting up FormsFlow.ai to integrate with Epic EHR systems using SMART on FHIR authentication and patient data mapping.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Register Your App on SMART Health IT](#step-1-register-your-app-on-smart-health-it)
4. [Step 2: Configure Environment Variables](#step-2-configure-environment-variables)
5. [Step 3: Configure config.js](#step-3-configure-configjs)
6. [Step 4: Install Dependencies](#step-4-install-dependencies)
7. [How It Works: Authentication Flow](#how-it-works-authentication-flow)
8. [How It Works: Patient Data Mapping](#how-it-works-patient-data-mapping)
9. [How It Works: Form Submission](#how-it-works-form-submission)
10. [Testing the Integration](#testing-the-integration)
11. [Troubleshooting](#troubleshooting)

---

## Overview

FormsFlow.ai integrates with Epic EHR systems using the SMART on FHIR protocol. This integration allows:

- **Secure Authentication**: OAuth2-based authentication with Epic
- **Patient Context**: Automatic retrieval of patient demographics from the EHR
- **Form Pre-filling**: Automatic mapping of patient data to form fields
- **Seamless Workflow**: Forms launched directly from Epic with patient context

The integration uses the [SMART Health IT Launch Sandbox](https://launch.smarthealthit.org/) for testing and can be configured for production Epic instances.

---

## Prerequisites

Before starting, ensure you have:

1. **FormsFlow.ai Application**: A running instance of FormsFlow.ai web application
2. **Node.js and npm**: For installing dependencies
3. **Access to SMART Health IT**: For testing (https://launch.smarthealthit.org/)
4. **Epic Access**: For production deployment (Epic App Orchard account)

---

## Step 1: Register Your App on SMART Health IT

### 1.1 Navigate to SMART Health IT Launch Sandbox

1. Go to [https://launch.smarthealthit.org/](https://launch.smarthealthit.org/)
2. This is the SMART Health IT Launch Sandbox for testing SMART on FHIR applications

### 1.2 Register Your Application

1. **Click on "Register"** or navigate to the registration page
2. **Fill in the application details**:
   - **App Name**: Your application name (e.g., "FormsFlow.ai")
   - **Redirect URI**: This must match exactly what you configure in FormsFlow.ai
     - For local development: `http://localhost:3000/public/form/{formId}`
     - For production: `https://your-domain.com/public/form/{formId}`
     - **Important**: The redirect URI should point to your form page, not the launch.html page
   - **Scopes**: Select the following scopes:
     - `launch` - Required for EHR launch
     - `launch/patient` - Required for patient context
     - `patient/*.read` - Read access to patient data
     - `patient/*.write` - If you need to write data back (optional)

3. **Save your Client ID**: After registration, you'll receive a **Client ID** (UUID format)
   - **Save this Client ID** - you'll need it for configuration

### 1.3 Configure Launch Settings

1. **Launch Type**: Select "EHR Launch" (not standalone launch)
2. **Patient Selection**: Ensure "Require Patient Selection" is enabled
3. **Launch URL**: The system will generate a launch URL that looks like:
   ```
   https://launch.smarthealthit.org/v/r4/fhir
   ```

### 1.4 Test Launch Configuration

1. **Copy the Launch URL** from the SMART Health IT dashboard https://launch.smarthealthit.org
2. **Note the Client ID** from your registered app
3. You'll use these values in the next steps

---

## Step 2: Configure Environment Variables

FormsFlow.ai reads SMART on FHIR configuration from environment variables. You can set these in multiple ways:

### 2.1 Option A: Environment Variables (Development)

Create a `.env` file in the `forms-flow-web` directory:

```bash
# SMART on FHIR Configuration
REACT_APP_SMART_CLIENT_ID=<client-id>
REACT_APP_SMART_REDIRECT_URI=http://localhost:3000/public/form/epicform
REACT_APP_SMART_SCOPE=launch launch/patient patient/*.read

# Optional: Enable debug logging for EHR integration
REACT_APP_EHR_DEBUG=true
```

**Important Notes:**
- Replace `<client-id>` with your actual Client ID from Step 1
- Replace `epicform` with your actual form ID, or use a dynamic form ID
- The redirect URI must **exactly match** what you registered in SMART Health IT
- For production, use your production domain instead of `localhost:3000`

### 2.2 Option B: Runtime Configuration (Production)

For production deployments, use the `config.js` file (see Step 3).

### 2.3 Environment Variable Reference

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `REACT_APP_SMART_CLIENT_ID` | Client ID from SMART Health IT registration | `<client-id>` | Yes |
| `REACT_APP_SMART_REDIRECT_URI` | OAuth redirect URI (must match registration) | `http://localhost:3000/public/form/epicform` | Yes |
| `REACT_APP_SMART_SCOPE` | OAuth scopes (space-separated) | `launch launch/patient patient/*.read` | No (has default) |
| `REACT_APP_EHR_DEBUG` | Enable debug logging | `true` or `false` | No |

---

## Step 3: Configure config.js

For production deployments using the root-config microfrontend architecture, configure the `config.js` file:

### 3.1 Locate config.js

The configuration file is located at:
```
forms-flow-web-root-config/public/config/config.js
```

### 3.2 Add SMART Configuration

Add the following properties to the `window._env_` object:

```javascript
window["_env_"] = {
  // ... existing configuration ...
  
  // SMART on FHIR Configuration
  "REACT_APP_SMART_CLIENT_ID": "<client-id>",
  "REACT_APP_SMART_REDIRECT_URI": "https://your-domain.com/public/form/epicform",
  "REACT_APP_SMART_SCOPE": "launch launch/patient patient/*.read",
  
  // Optional: Enable debug logging
  "REACT_APP_EHR_DEBUG": "true"
};
```

### 3.3 Example config.js

```javascript
window["_env_"] = {
  "NODE_ENV": "production",
  "REACT_APP_API_SERVER_URL": "https://forms-flow-forms-qa.aot-technologies.com",
  "REACT_APP_API_PROJECT_URL": "https://forms-flow-forms-qa.aot-technologies.com",
  "REACT_APP_BPM_URL": "https://forms-flow-bpm-qa.aot-technologies.com/camunda",
  "REACT_APP_KEYCLOAK_CLIENT": "forms-flow-web",
  "REACT_APP_WEB_BASE_URL": "https://forms-flow-api-qa.aot-technologies.com",
  
  // SMART on FHIR Configuration
  "REACT_APP_SMART_CLIENT_ID": "<client-id>",
  "REACT_APP_SMART_REDIRECT_URI": "https://your-domain.com/public/form/epicform",
  "REACT_APP_SMART_SCOPE": "launch launch/patient patient/*.read",
  "REACT_APP_EHR_DEBUG": "false"
};
```

**Important Notes:**
- Use your production domain in `REACT_APP_SMART_REDIRECT_URI`
- Ensure the redirect URI matches exactly what you registered in SMART Health IT
- The `launch.html` file automatically loads this config.js file

---

## Step 4: Install Dependencies

The EHR integration requires the `fhirclient` npm package:

### 4.1 Install fhirclient

```bash
cd forms-flow-web
npm install fhirclient
```

### 4.2 Verify Installation

The package should be listed in `package.json`:

```json
{
  "dependencies": {
    "fhirclient": "^2.x.x"
  }
}
```

---

## How It Works: Authentication Flow

The authentication flow follows the SMART on FHIR OAuth2 protocol:

### 1. Initial Launch from Epic

```
Epic EHR → FormsFlow.ai Form URL
```

When a user launches a form from Epic, Epic redirects to your application with launch parameters:

```
https://your-domain.com/public/form/epicform?isEHR=true&iss=https://launch.smarthealthit.org/v/r4/fhir&launch=WzAsIjMyMzU4NTQsYmZlMGE1ZDctOTg2Yi00NmVkLWIzNTUtOWNhMjMyYzQ2ODhlIiwiMWNiNTExNTctODA4My00MTBmLTg3ZDEtMDdhOTQ2MjkyMjJhIiwiTUFOVUFMIiwwLDAsMCwiIiwiIiwiIiwiIiwiIiwiIiwiIiwwLDEsIiJd
```

**Parameters:**
- `isEHR=true`: Indicates this is an EHR launch
- `iss`: The FHIR server issuer URL
- `launch`: Encoded launch context (patient ID, encounter, etc.)

### 2. Redirect to launch.html

The application detects the EHR launch and redirects to `launch.html`:

```
/public/form/epicform?isEHR=true&iss=...&launch=...
  ↓
/launch.html?iss=...&launch=...&clientId=...&redirectUri=...
```

**Location:** `forms-flow-web-root-config/public/launch.html`

**Important**: This is the only `launch.html` file that should exist. The file in `forms-flow-web/public/launch.html` (if present) is outdated and should be removed.

This file:
- Loads the `fhirclient` library from CDN
- Reads configuration from `config.js` or URL parameters
- Stores launch context in `sessionStorage`
- Initiates OAuth2 authorization

### 3. OAuth2 Authorization

The `launch.html` file calls `FHIR.oauth2.authorize()` which:

1. Redirects to the EHR's authorization server
2. User authenticates (if not already)
3. User authorizes the application
4. EHR redirects back with authorization code

```
launch.html
  ↓
FHIR.oauth2.authorize()
  ↓
EHR Authorization Server
  ↓
User Authentication & Authorization
  ↓
Redirect with code
```

### 4. OAuth2 Callback

After authorization, the EHR redirects back to your redirect URI:

```
https://your-domain.com/public/form/epicform?isEHR=true&code=AUTHORIZATION_CODE&state=STATE
```

### 5. Token Exchange

The application (`ehrService.js`) detects the authorization code and:

1. Calls `fhirclient.ready()` with the adapter and options
2. Exchanges the authorization code for an access token
3. Returns an authenticated FHIR client

**Code Location:** `forms-flow-web/src/services/ehrService.js`

```javascript
const fhirClient = await ready(adapter, {
  clientId: clientId,
  scope: scope,
  redirectUri: redirectUri,
  iss: storedIss,  // From sessionStorage
  launch: storedLaunch  // From sessionStorage
});
```

### 6. Session Storage

Throughout the flow, critical data is stored in `sessionStorage`:

- `epic_iss`: FHIR server issuer URL
- `epic_launch`: Launch context
- `epic_formId`: Form ID being accessed
- `epic_isEHR`: Flag indicating EHR launch

This ensures context is preserved across redirects.

---

## How It Works: Patient Data Mapping

Once authenticated, the application fetches and maps patient data:

### 1. Fetch Patient Resource

**Code Location:** `forms-flow-web/src/services/ehrService.js`

```javascript
const patient = await client.patient.read();
```

This fetches the FHIR Patient resource for the patient in context.

### 2. Extract Patient Demographics

**Code Location:** `forms-flow-web/src/services/ehrMapper.js`

The `mapPatientToFormio()` function extracts:

- **Name**: First name, middle name, last name, prefix, suffix
- **Demographics**: Date of birth, age, gender
- **Address**: Street address, city, state, ZIP code, country
- **Contact**: Phone number, email
- **Identifiers**: Medical Record Number (MRN), Patient ID

### 3. Map to Form Fields

The mapper uses intelligent matching to map patient data to form field keys:

#### Matching Strategies

1. **Exact Match**: Field key exactly matches patient data key
   - `firstName` → `firstName` ✅

2. **Case-Insensitive Match**: Field key matches ignoring case
   - `FIRSTNAME` → `firstName` ✅

3. **Partial Match**: Field key contains common patterns
   - `patientFirstName` → `firstName` ✅
   - `dateOfBirth` → `dob` ✅
   - `phoneNumber` → `phone` ✅

#### Supported Field Name Variations

The mapper recognizes multiple naming conventions:

| Patient Data | Supported Field Keys |
|--------------|---------------------|
| First Name | `firstName`, `firstname`, `first-name`, `patientFirstName` |
| Last Name | `lastName`, `lastname`, `last-name`, `patientLastName` |
| Date of Birth | `dateOfBirth`, `dob`, `birthDate`, `birthdate` |
| Phone | `phone`, `phoneNumber`, `phonenumber`, `phone-number`, `telephone` |
| Email | `email`, `emailAddress`, `emailaddress`, `email-address` |
| Address Line 1 | `addressLine1`, `addressline1`, `address-line-1`, `address1` |
| City | `city` |
| State | `state` |
| ZIP Code | `zipCode`, `zipcode`, `zip-code`, `postalCode`, `zip` |
| Gender | `gender`, `sex` |
| MRN | `mrn`, `medicalRecordNumber`, `medicalrecordnumber`, `medical-record-number` |

### 4. Apply to Form

**Code Location:** `forms-flow-web/src/routes/Submit/Forms/UserForm.js`

The mapped data is applied to the Form.io form instance:

```javascript
const mappedData = mapPatientToFormio(patientData.patient, form);
const submissionData = { data: mappedData };
setEhrSubmission(submissionData);

// Apply to form instance
formRef.current.submission = submissionData;
formRef.current.data = mergedData;
```

The form automatically populates with patient data.

---

## How It Works: Form Submission

After the form is pre-filled with patient data:

### 1. User Completes Form

The user reviews the pre-filled data and completes any remaining fields.

### 2. Form Submission

When the user submits the form:

1. **Form Data Collection**: Form.io collects all form field values
2. **Submission Processing**: The submission is processed by FormsFlow.ai
3. **Workflow Integration**: The submission triggers any configured workflows
4. **Data Storage**: The submission is stored in the FormsFlow.ai database

### 3. Patient Context Preservation

The patient context from the EHR launch is preserved in the submission metadata, allowing you to:
- Link submissions to specific patients
- Query submissions by patient ID
- Maintain audit trails

**Note**: The current implementation does not write data back to the EHR. To enable this, you would need to:
1. Request `patient/*.write` scope during registration
2. Implement FHIR write operations in your submission handler
3. Follow Epic's guidelines for writing data back to the EHR

---

## Testing the Integration

### 1. Start the Application

```bash
cd forms-flow-web
npm start
```

The application should start on `http://localhost:3000`

### 2. Create a Test Form

1. Navigate to the Forms Designer
2. Create a form with fields that match patient demographics:
   - `firstName` (textfield)
   - `lastName` (textfield)
   - `dateOfBirth` (datetime)
   - `phone` (textfield)
   - `email` (email)
   - `addressLine1` (textfield)
   - `city` (textfield)
   - `state` (textfield)
   - `zipCode` (textfield)

3. Save the form and note the form ID (e.g., `epicform`)

### 3. Test Launch from SMART Health IT

1. Go to [https://launch.smarthealthit.org/](https://launch.smarthealthit.org/)
2. Select a patient
3. Enter your launch URL:
   ```
   http://localhost:3000/public/form/epicform?isEHR=true
   ```
4. Click "Launch"

### 4. Verify Authentication

1. You should be redirected through the OAuth flow
2. After authentication, you should return to your form
3. Check the browser console for debug logs (if `REACT_APP_EHR_DEBUG=true`)

### 5. Verify Patient Data Mapping

1. The form should be pre-filled with patient data
2. Verify that fields match the patient demographics
3. Check the browser console for mapping logs:
   ```
   === Field Mapping Results ===
   Matched fields: [...]
   Unmatched fields: [...]
   ```

### 6. Test Form Submission

1. Complete any remaining fields
2. Submit the form
3. Verify the submission is saved with patient context

---

## Troubleshooting

### Authentication Issues

**Problem**: "Cannot GET /launch.html"

**Solution**: 
- Ensure `launch.html` is in `forms-flow-web-root-config/public/launch.html` (this is the correct location)
- For single-spa microfrontends, static files must be in the root-config's public folder
- The webpack build process copies files from `forms-flow-web-root-config/public/` to the build output

**Problem**: "This app must be launched from Epic"

**Solution**:
- Ensure you're launching from SMART Health IT or Epic with `isEHR=true` parameter
- Check that `iss` and `launch` parameters are present in the URL
- Verify your redirect URI matches exactly what you registered

**Problem**: "BrowserAdapter is not a constructor"

**Solution**:
- Ensure `fhirclient` is installed: `npm install fhirclient`
- Check that the package is in `node_modules`
- Restart the development server

### Patient Data Not Mapping

**Problem**: Fields are not pre-filling

**Solution**:
1. **Check Field Names**: Ensure form field keys match supported naming conventions
2. **Check Console Logs**: Enable debug logging (`REACT_APP_EHR_DEBUG=true`) and check for mapping errors
3. **Verify Patient Data**: Check that the EHR has the patient data you expect
4. **Check Mapper Logic**: Review `src/services/ehrMapper.js` for mapping rules

**Problem**: Only some fields are mapping

**Solution**:
- The mapper uses partial matching, but exact matches are preferred
- Check the "Unmatched fields" in the console logs
- Consider renaming form fields to match exact patient data keys
- Review the supported field name variations in this guide

### Configuration Issues

**Problem**: "SMART client ID not configured"

**Solution**:
- Ensure `REACT_APP_SMART_CLIENT_ID` is set in environment variables or `config.js`
- For root-config deployments, ensure `config.js` is loaded before `launch.html`
- Check that the Client ID matches what you registered in SMART Health IT

**Problem**: Redirect URI mismatch

**Solution**:
- The redirect URI must **exactly match** what you registered in SMART Health IT
- Check for trailing slashes, protocol (http vs https), and port numbers
- Ensure the form ID in the redirect URI matches your actual form ID

### Redirect Loop

**Problem**: Application redirects in a loop

**Solution**:
- Clear browser session storage: `sessionStorage.clear()`
- Check that `launch.html` correctly handles OAuth callbacks
- Verify that the redirect URI includes `isEHR=true` parameter
- Check browser console for error messages

### Production Deployment

**Problem**: Integration works locally but not in production

**Solution**:
1. **HTTPS Required**: Production Epic instances require HTTPS
2. **Redirect URI**: Update redirect URI in both SMART Health IT registration and `config.js`
3. **CORS**: Ensure your production domain is whitelisted in Epic
4. **Environment Variables**: Use `config.js` for production configuration
5. **Epic App Orchard**: For production Epic, register through Epic App Orchard, not SMART Health IT

---

## Additional Resources

- [SMART on FHIR Documentation](http://hl7.org/fhir/smart-app-launch/)
- [SMART Health IT Launch Sandbox](https://launch.smarthealthit.org/)
- [Epic App Orchard](https://apporchard.epic.com/)
- [FHIR Patient Resource](https://www.hl7.org/fhir/patient.html)
- [FormsFlow.ai Documentation](../README.md)

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the browser console for error messages
3. Enable debug logging: `REACT_APP_EHR_DEBUG=true`
4. Check FormsFlow.ai GitHub issues
5. Contact your FormsFlow.ai administrator

---

**Last Updated**: 2024
**Version**: 1.0

