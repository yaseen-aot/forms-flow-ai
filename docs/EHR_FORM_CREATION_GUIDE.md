# EHR Form Creation Guide

This guide explains how to create forms in forms-flow-ai that will automatically pre-fill with patient demographics from EHR systems using SMART on FHIR integration.

## Overview

When a form is accessed with the `isEHR=true` query parameter, the system will:
1. Authenticate with the EHR system using SMART on FHIR
2. Fetch patient demographics from the EHR
3. Automatically map patient data to form fields based on field names
4. Pre-fill the form with the mapped data

## Field Naming Conventions

To ensure automatic mapping of patient demographics to your form fields, use these recommended field names:

### Name Fields

| Field Name Variations | Mapped From |
|----------------------|-------------|
| `firstName`, `firstname`, `first-name` | Patient's first name |
| `middleName`, `middlename`, `middle-name` | Patient's middle name |
| `lastName`, `lastname`, `last-name` | Patient's last name |
| `namePrefix`, `nameprefix`, `prefix` | Name prefix (Mr., Mrs., Dr., etc.) |
| `nameSuffix`, `namesuffix`, `suffix` | Name suffix (Jr., Sr., II, III, etc.) |
| `fullName`, `fullname` | Complete patient name |

### Demographics

| Field Name Variations | Mapped From |
|----------------------|-------------|
| `dateOfBirth`, `dateofbirth`, `dob`, `birthDate`, `birthdate` | Patient's date of birth |
| `age` | Calculated age from date of birth |
| `gender`, `sex` | Patient's gender (Male, Female, Other, Unknown) |
| `maritalStatus`, `maritalstatus` | Marital status |
| `preferredLanguage`, `preferredlanguage` | Preferred language |

### Address Fields

| Field Name Variations | Mapped From |
|----------------------|-------------|
| `addressLine1`, `addressline1`, `address-line-1`, `address1` | First line of address |
| `addressLine2`, `addressline2`, `address-line-2`, `address2` | Second line of address |
| `city` | City |
| `state` | State/Province |
| `zipCode`, `zipcode`, `zip-code`, `postalCode`, `postalcode`, `zip` | ZIP/Postal code |
| `country` | Country |

### Contact Information

| Field Name Variations | Mapped From |
|----------------------|-------------|
| `phone`, `phoneNumber`, `phonenumber`, `phone-number`, `telephone` | Phone number |
| `email`, `emailAddress`, `emailaddress`, `email-address` | Email address |

### Identifiers

| Field Name Variations | Mapped From |
|----------------------|-------------|
| `medicalRecordNumber`, `medicalrecordnumber`, `medical-record-number`, `mrn` | Medical Record Number |
| `patientId`, `patientid`, `patient-id` | Patient ID from EHR |

## How Mapping Works

The EHR mapper uses a three-tier matching strategy:

1. **Exact Match**: First tries to match the field key exactly (case-insensitive)
2. **Partial Match**: If no exact match, tries to match based on keywords:
   - Fields containing "first" and "name" → maps to first name
   - Fields containing "last" and "name" → maps to last name
   - Fields containing "dob" or "birth" and "date" → maps to date of birth
   - And so on...

3. **Common Variations**: Supports common naming patterns like:
   - camelCase: `firstName`
   - lowercase: `firstname`
   - kebab-case: `first-name`
   - snake_case: `first_name` (if used)

## Example Form Structure

Here's an example of a patient registration form that will work well with EHR integration:

```json
{
  "title": "Patient Registration Form",
  "components": [
    {
      "key": "firstName",
      "type": "textfield",
      "label": "First Name",
      "input": true
    },
    {
      "key": "lastName",
      "type": "textfield",
      "label": "Last Name",
      "input": true
    },
    {
      "key": "dateOfBirth",
      "type": "datetime",
      "label": "Date of Birth",
      "widget": {
        "type": "calendar",
        "dateFormat": "yyyy-MM-dd"
      },
      "input": true
    },
    {
      "key": "gender",
      "type": "select",
      "label": "Gender",
      "data": {
        "values": [
          { "label": "Male", "value": "Male" },
          { "label": "Female", "value": "Female" },
          { "label": "Other", "value": "Other" }
        ]
      },
      "input": true
    },
    {
      "key": "addressLine1",
      "type": "textfield",
      "label": "Address Line 1",
      "input": true
    },
    {
      "key": "city",
      "type": "textfield",
      "label": "City",
      "input": true
    },
    {
      "key": "state",
      "type": "textfield",
      "label": "State",
      "input": true
    },
    {
      "key": "zipCode",
      "type": "textfield",
      "label": "ZIP Code",
      "input": true
    },
    {
      "key": "phone",
      "type": "phoneNumber",
      "label": "Phone Number",
      "input": true
    },
    {
      "key": "email",
      "type": "email",
      "label": "Email Address",
      "input": true
    }
  ]
}
```

## Best Practices

### 1. Use Standard Field Names
- Prefer camelCase naming: `firstName`, `dateOfBirth`, `zipCode`
- Avoid special characters in field keys when possible
- Use descriptive, clear field names

### 2. Field Types
- Use appropriate Form.io field types:
  - `textfield` for names, addresses
  - `datetime` for dates
  - `email` for email addresses
  - `phoneNumber` for phone numbers
  - `select` for gender, marital status, etc.

### 3. Nested Components
The mapper automatically processes nested components (panels, columns, tabs, etc.), so you can organize your form however you like.

### 4. Read-Only Fields
Consider making identifier fields (MRN, Patient ID) read-only since they come from the EHR:

```json
{
  "key": "medicalRecordNumber",
  "type": "textfield",
  "label": "Medical Record Number",
  "disabled": true,
  "input": true
}
```

## Testing EHR Integration

### 1. Configure SMART on FHIR

Set the following environment variables:

```bash
REACT_APP_SMART_CLIENT_ID=your-client-id
REACT_APP_SMART_REDIRECT_URI=http://localhost:3000/design/form/preview/:formId
REACT_APP_SMART_SCOPE=launch launch/patient patient/*.read
```

### 2. Access Form with EHR Parameter

Navigate to your form preview with the `isEHR` query parameter:

```
http://localhost:3000/design/form/preview/your-form-id?isEHR=true
```

### 3. Launch from EHR

The form should be launched from an EHR system (like Epic) with patient context. The system will:
- Authenticate via SMART on FHIR
- Fetch patient demographics
- Pre-fill the form automatically

### 4. Verify Mapping

Check that patient data appears in the correct form fields. If fields are not mapping correctly:
- Verify field names match the recommended naming conventions
- Check browser console for any error messages
- Review the mapper logic in `src/services/ehrMapper.js`

## Troubleshooting

### Fields Not Pre-filling

1. **Check Field Names**: Ensure field keys match the recommended naming conventions
2. **Check Console**: Look for errors in the browser console
3. **Verify EHR Connection**: Ensure SMART authentication completed successfully
4. **Check Patient Data**: Verify the EHR has the patient data you expect

### Authentication Errors

1. **Missing Client ID**: Ensure `REACT_APP_SMART_CLIENT_ID` is set
2. **Redirect URI Mismatch**: Verify `REACT_APP_SMART_REDIRECT_URI` matches EHR configuration
3. **Scope Issues**: Ensure required scopes are requested

### Partial Mapping

If only some fields are mapping:
- The mapper uses partial matching, but exact matches are preferred
- Consider renaming fields to match standard names exactly
- Check that the EHR patient resource contains the expected data

## Dependencies

To use EHR integration, ensure the following package is installed:

```bash
npm install fhirclient
```

## Additional Resources

- [SMART on FHIR Documentation](http://docs.smarthealthit.org/)
- [FHIR Patient Resource](https://www.hl7.org/fhir/patient.html)
- [Form.io Documentation](https://formio.github.io/formio.js/)

## Support

For issues or questions about EHR integration:
1. Check the browser console for error messages
2. Review the mapper implementation in `src/services/ehrMapper.js`
3. Review the EHR service in `src/services/ehrService.js`
4. Check the FormPreview component in `src/routes/Design/Forms/FormPreview.js`

