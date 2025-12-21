/**
 * EHR Mapper Utility
 * Maps FHIR Patient demographics to Form.io form fields
 * Based on the Foundry project implementation
 */

import { debugLog } from './ehrConfig';

/**
 * Safely convert a value to string, returning empty string for objects/null/undefined
 * @param {any} value - Value to convert
 * @returns {string} String value or empty string
 */
function safeString(value) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }
  // Handle objects and arrays - return empty string
  if (typeof value === 'object') {
    return '';
  }
  // Handle functions - return empty string
  if (typeof value === 'function') {
    return '';
  }
  // Convert primitives to string
  const str = String(value);
  // Final safety check - if it looks like [object Object], return empty
  if (str === '[object Object]' || str.startsWith('[object ')) {
    return '';
  }
  return str;
}

/**
 * Map FHIR Patient resource to Form.io form data structure
 * Attempts to match patient data to form field keys using common naming patterns
 * 
 * @param {Object} patient - FHIR Patient resource
 * @param {Object} form - Form.io form schema
 * @returns {Object} Form.io form data object with mapped values
 */
export function mapPatientToFormio(patient, form) {
  if (!patient) {
    console.log("No patient data available");
    return {};
  }

  debugLog("Raw patient data:", JSON.stringify(patient, null, 2));

  // Extract name (prefer official name, fallback to first name)
  const name = patient.name?.find(n => n.use === 'official') || 
               patient.name?.[0] || {};
  
  // Handle given names - ensure we get strings, not objects
  let givenNames = [];
  if (Array.isArray(name.given)) {
    givenNames = name.given.map(n => typeof n === 'string' ? n : '');
  } else if (typeof name.given === 'string') {
    givenNames = [name.given];
  }
  
  // Handle family name - ensure it's a string
  const familyName = typeof name.family === 'string' ? name.family : '';
  
  debugLog("Extracted name parts:", { givenNames, familyName, rawName: name });
  
  // Extract address (prefer home address, fallback to first address)
  const address = patient.address?.find(a => a.use === 'home') || 
                  patient.address?.[0] || {};
  
  // Handle address lines - ensure we get strings
  let addressLines = [];
  if (Array.isArray(address.line)) {
    addressLines = address.line.map(l => typeof l === 'string' ? l : '');
  }
  
  // Extract contact info - ensure values are strings
  const phoneObj = patient.telecom?.find(t => t.system === 'phone');
  const emailObj = patient.telecom?.find(t => t.system === 'email');
  const phoneValue = typeof phoneObj?.value === 'string' ? phoneObj.value : '';
  const emailValue = typeof emailObj?.value === 'string' ? emailObj.value : '';
  
  // Extract identifiers - ensure value is string
  const mrnObj = patient.identifier?.find(
    id => id.type?.coding?.some(c => c.code === 'MR')
  );
  const mrnValue = typeof mrnObj?.value === 'string' ? mrnObj.value : '';
  
  debugLog("Extracted contact/id:", { phoneValue, emailValue, mrnValue });
  
  // Calculate age from birth date
  let age = null;
  if (patient.birthDate) {
    const today = new Date();
    const birth = new Date(patient.birthDate);
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }
  
  // Base mapping of patient data - use safeString to ensure all values are primitives
  const patientData = {
    // Name fields - common variations
    firstName: safeString(givenNames[0]),
    firstname: safeString(givenNames[0]),
    'first-name': safeString(givenNames[0]),
    middleName: safeString(givenNames[1]),
    middlename: safeString(givenNames[1]),
    'middle-name': safeString(givenNames[1]),
    lastName: safeString(familyName),
    lastname: safeString(familyName),
    'last-name': safeString(familyName),
    namePrefix: safeString(name.prefix?.[0]),
    nameprefix: safeString(name.prefix?.[0]),
    prefix: safeString(name.prefix?.[0]),
    nameSuffix: safeString(name.suffix?.[0]),
    namesuffix: safeString(name.suffix?.[0]),
    suffix: safeString(name.suffix?.[0]),
    fullName: `${givenNames.join(' ')} ${familyName}`.trim(),
    fullname: `${givenNames.join(' ')} ${familyName}`.trim(),
    
    // Demographics
    dateOfBirth: safeString(patient.birthDate),
    dateofbirth: safeString(patient.birthDate),
    dob: safeString(patient.birthDate),
    birthDate: safeString(patient.birthDate),
    birthdate: safeString(patient.birthDate),
    age: age !== null ? age.toString() : '',
    gender: typeof patient.gender === 'string' && patient.gender ? 
      patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '',
    sex: typeof patient.gender === 'string' && patient.gender ? 
      patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '',
    
    // Address
    addressLine1: safeString(addressLines[0]),
    addressline1: safeString(addressLines[0]),
    'address-line-1': safeString(addressLines[0]),
    address1: safeString(addressLines[0]),
    addressLine2: safeString(addressLines[1]),
    addressline2: safeString(addressLines[1]),
    'address-line-2': safeString(addressLines[1]),
    address2: safeString(addressLines[1]),
    city: safeString(address.city),
    state: safeString(address.state),
    zipCode: safeString(address.postalCode),
    zipcode: safeString(address.postalCode),
    'zip-code': safeString(address.postalCode),
    postalCode: safeString(address.postalCode),
    postalcode: safeString(address.postalCode),
    zip: safeString(address.postalCode),
    country: safeString(address.country),
    
    // Contact
    phone: phoneValue,
    phoneNumber: phoneValue,
    phonenumber: phoneValue,
    'phone-number': phoneValue,
    telephone: phoneValue,
    email: emailValue,
    emailAddress: emailValue,
    emailaddress: emailValue,
    'email-address': emailValue,
    
    // Identifiers
    medicalRecordNumber: mrnValue,
    medicalrecordnumber: mrnValue,
    'medical-record-number': mrnValue,
    mrn: mrnValue,
    patientId: safeString(patient.id),
    patientid: safeString(patient.id),
    'patient-id': safeString(patient.id),
    
    // Additional demographics
    maritalStatus: safeString(patient.maritalStatus?.text) || 
                   safeString(patient.maritalStatus?.coding?.[0]?.display),
    maritalstatus: safeString(patient.maritalStatus?.text) || 
                   safeString(patient.maritalStatus?.coding?.[0]?.display),
    preferredLanguage: safeString(patient.communication?.[0]?.language?.text) || 
                       safeString(patient.communication?.[0]?.language?.coding?.[0]?.display),
    preferredlanguage: safeString(patient.communication?.[0]?.language?.text) || 
                       safeString(patient.communication?.[0]?.language?.coding?.[0]?.display)
  };

  // If form schema is provided, try to match form field keys more intelligently
  if (form && form.components) {
    return mapToFormFields(patientData, form.components);
  }

  return patientData;
}

/**
 * Map patient data to form fields by analyzing form component keys
 * 
 * @param {Object} patientData - Base patient data mapping
 * @param {Array} components - Form.io form components
 * @returns {Object} Mapped form data
 */
function mapToFormFields(patientData, components) {
  const formData = {};
  const matchedFields = [];
  const unmatchedFields = [];
  
  debugLog("=== Starting field mapping ===");
  debugLog("Patient data keys available:", Object.keys(patientData).slice(0, 20));
  
  // Recursively process components (handles nested components, panels, wells, columns, etc.)
  const processComponents = (comps, depth = 0) => {
    if (!Array.isArray(comps)) return;
    
    debugLog(`${'  '.repeat(depth)}Processing ${comps.length} components at depth ${depth}`);
    
    comps.forEach(component => {
      // Skip container/layout components - they don't have input values
      const isContainerComponent = ['panel', 'well', 'columns', 'tabs', 'container', 'fieldset', 'button'].includes(component.type);
      
      // Process component if it has a key and is not a container
      // Also check if it's an input component (input: true or input not explicitly false)
      const isInputComponent = component.input === true || component.input === undefined;
      if (component.key && !isContainerComponent && isInputComponent) {
        const key = component.key;
        const label = (component.label || '').toLowerCase();
        
        // Try exact match first
        let matched = false;
        if (Object.prototype.hasOwnProperty.call(patientData, key)) {
          formData[key] = patientData[key];
          matchedFields.push({ field: key, value: patientData[key], method: 'exact' });
          const exactMatchMsg = `${'  '.repeat(depth)}  ✓ Exact match: "${key}" = "${patientData[key]}"`;
          debugLog(exactMatchMsg);
          matched = true;
        }
        
        // Try case-insensitive match
        if (!matched) {
          const lowerKey = key.toLowerCase();
          for (const [patientKey, value] of Object.entries(patientData)) {
            if (patientKey.toLowerCase() === lowerKey && value) {
              formData[key] = value;
              matchedFields.push({ field: key, value: value, method: 'case-insensitive', matchedKey: patientKey });
              debugLog(`${'  '.repeat(depth)}  ✓ Case-insensitive match: "${key}" (from "${patientKey}") = "${value}"`);
              matched = true;
              break;
            }
          }
        }
        
        // Try label-based matching (important for generic keys like textField, textField1, etc.)
        if (!matched && label) {
          // Street address - "Street, Apartment No., P.O. Box, R.R. NO."
          if ((label.includes('street') || label.includes('apartment') || label.includes('p.o.') || 
               label.includes('p.o box') || label.includes('r.r.') || label.includes('rr no')) && 
              patientData.addressLine1) {
            formData[key] = patientData.addressLine1;
            matchedFields.push({ field: key, value: patientData.addressLine1, method: 'label-street' });
            matched = true;
          }
          // City/Town
          else if ((label.includes('city') || label.includes('town')) && patientData.city) {
            formData[key] = patientData.city;
            matchedFields.push({ field: key, value: patientData.city, method: 'label-city' });
            matched = true;
          }
          // Province / Country
          else if (label.includes('province') && label.includes('country')) {
            const provinceCountry = patientData.state && patientData.country ? 
              `${patientData.state} / ${patientData.country}` : 
              (patientData.state || patientData.country || '');
            if (provinceCountry) {
              formData[key] = provinceCountry;
              matchedFields.push({ field: key, value: provinceCountry, method: 'label-provincecountry' });
              matched = true;
            }
          }
          // Postal Code
          else if (label.includes('postal') && label.includes('code') && patientData.postalCode) {
            formData[key] = patientData.postalCode;
            matchedFields.push({ field: key, value: patientData.postalCode, method: 'label-postalcode' });
            matched = true;
          }
          // Day Phone No.
          else if (label.includes('day') && label.includes('phone') && patientData.phone) {
            formData[key] = patientData.phone;
            matchedFields.push({ field: key, value: patientData.phone, method: 'label-dayphone' });
            matched = true;
          }
          // Alternate Phone No
          else if (label.includes('alternate') && label.includes('phone') && patientData.phone) {
            // Note: alternate phone not in base patientData, would need to be added
            // For now, skip or use primary phone as fallback
          }
          // E-mail Address
          else if ((label.includes('e-mail') || label.includes('email')) && patientData.email) {
            formData[key] = patientData.email;
            matchedFields.push({ field: key, value: patientData.email, method: 'label-email' });
            matched = true;
          }
        }
        
        // Try partial matching for common patterns (only if not already matched)
        // e.g., "patientFirstName" matches "firstName"
        let partialMatch = false;
        if (!matched) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('first') && lowerKey.includes('name')) {
          if (patientData.firstName) {
            formData[key] = patientData.firstName;
            matchedFields.push({ field: key, value: patientData.firstName, method: 'partial-firstname' });
            debugLog(`${'  '.repeat(depth)}  ✓ Partial match (firstname): "${key}" = "${patientData.firstName}"`);
            partialMatch = true;
          }
        } else if (lowerKey.includes('last') && lowerKey.includes('name')) {
          if (patientData.lastName) {
            formData[key] = patientData.lastName;
            matchedFields.push({ field: key, value: patientData.lastName, method: 'partial-lastname' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('middle') && lowerKey.includes('name')) {
          if (patientData.middleName) {
            formData[key] = patientData.middleName;
            matchedFields.push({ field: key, value: patientData.middleName, method: 'partial-middlename' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('dob') || (lowerKey.includes('birth') && lowerKey.includes('date'))) {
          if (patientData.dateOfBirth) {
            formData[key] = patientData.dateOfBirth;
            matchedFields.push({ field: key, value: patientData.dateOfBirth, method: 'partial-dob' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('phone')) {
          // Check for dayPhoneNo, alternatePhoneNo, etc.
          if (lowerKey.includes('day') || lowerKey.includes('phoneno') || lowerKey === 'dayphoneno') {
            if (patientData.phone) {
              formData[key] = patientData.phone;
              matchedFields.push({ field: key, value: patientData.phone, method: 'partial-dayphone' });
              partialMatch = true;
            }
          } else if (lowerKey.includes('alternate')) {
            // Alternate phone - would need to be in patientData
            // For now, skip or use primary phone
          } else if (patientData.phone) {
            formData[key] = patientData.phone;
            matchedFields.push({ field: key, value: patientData.phone, method: 'partial-phone' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('email') || lowerKey.includes('mail')) {
          // Handle eMailAddress, emailAddress, etc.
          if (patientData.email) {
            formData[key] = patientData.email;
            matchedFields.push({ field: key, value: patientData.email, method: 'partial-email' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('textfield')) {
          // Generic textField keys - try to match by label if available
          // This is handled above in label-based matching
        } else if (lowerKey.includes('address') && (lowerKey.includes('1') || lowerKey.includes('line1'))) {
          if (patientData.addressLine1) {
            formData[key] = patientData.addressLine1;
            matchedFields.push({ field: key, value: patientData.addressLine1, method: 'partial-address1' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('address') && (lowerKey.includes('2') || lowerKey.includes('line2'))) {
          if (patientData.addressLine2) {
            formData[key] = patientData.addressLine2;
            matchedFields.push({ field: key, value: patientData.addressLine2, method: 'partial-address2' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('city')) {
          if (patientData.city) {
            formData[key] = patientData.city;
            matchedFields.push({ field: key, value: patientData.city, method: 'partial-city' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('state')) {
          if (patientData.state) {
            formData[key] = patientData.state;
            matchedFields.push({ field: key, value: patientData.state, method: 'partial-state' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('zip') || lowerKey.includes('postal')) {
          if (patientData.zipCode) {
            formData[key] = patientData.zipCode;
            matchedFields.push({ field: key, value: patientData.zipCode, method: 'partial-zip' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('country')) {
          if (patientData.country) {
            formData[key] = patientData.country;
            matchedFields.push({ field: key, value: patientData.country, method: 'partial-country' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('gender') || lowerKey.includes('sex')) {
          if (patientData.gender) {
            formData[key] = patientData.gender;
            matchedFields.push({ field: key, value: patientData.gender, method: 'partial-gender' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('mrn') || (lowerKey.includes('medical') && lowerKey.includes('record'))) {
          if (patientData.medicalRecordNumber) {
            formData[key] = patientData.medicalRecordNumber;
            matchedFields.push({ field: key, value: patientData.medicalRecordNumber, method: 'partial-mrn' });
            partialMatch = true;
          }
          }
        }
        
        if (!matched && !partialMatch) {
          unmatchedFields.push(key);
        }
      }
      
      // IMPORTANT: Process nested structures in the correct order
      // Always process nested components, even for container components
      // 1. First, process columns structure (columns have a 'columns' array, each with 'components')
      if (component.type === 'columns' && component.columns && Array.isArray(component.columns)) {
        debugLog(`${'  '.repeat(depth)}Found columns component "${component.key || 'unnamed'}" with ${component.columns.length} columns`);
        component.columns.forEach((column, colIdx) => {
          if (column.components && Array.isArray(column.components)) {
            debugLog(`${'  '.repeat(depth)}  Processing column ${colIdx + 1} with ${column.components.length} components`);
            processComponents(column.components, depth + 1);
          }
        });
      }
      // 2. Then process standard nested components (for panels, wells, tabs, etc.)
      // Note: Columns components might also have a components array, but we prioritize columns
      else if (component.components && Array.isArray(component.components)) {
        debugLog(`${'  '.repeat(depth)}Found nested components in "${component.key || component.type || 'unnamed'}" (${component.components.length} components)`);
        processComponents(component.components, depth + 1);
      }
      // 3. Handle tabs structure (tabs have a 'tabs' array, each with 'components')
      else if (component.type === 'tabs' && component.tabs && Array.isArray(component.tabs)) {
        debugLog(`${'  '.repeat(depth)}Found tabs component "${component.key || 'unnamed'}" with ${component.tabs.length} tabs`);
        component.tabs.forEach((tab, tabIdx) => {
          if (tab.components && Array.isArray(tab.components)) {
            debugLog(`${'  '.repeat(depth)}  Processing tab ${tabIdx + 1} "${tab.label || tab.key || 'unnamed'}" with ${tab.components.length} components`);
            processComponents(tab.components, depth + 1);
          }
        });
      }
    });
  };
  
  processComponents(components);
  
  // Final safety check - ensure ALL values are strings, not objects
  const safeFormData = {};
  Object.keys(formData).forEach(key => {
    const value = formData[key];
    if (typeof value === 'string') {
      safeFormData[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safeFormData[key] = String(value);
    } else {
      // Skip objects, arrays, null, undefined
      debugLog(`Filtering out non-primitive value for key ${key}:`, typeof value, value);
    }
  });
  
  debugLog("=== Field Mapping Results ===");
  debugLog("Matched fields:", matchedFields);
  debugLog("Unmatched fields:", unmatchedFields);
  debugLog("Total form fields processed:", matchedFields.length + unmatchedFields.length);
  debugLog("Successfully mapped:", matchedFields.length);
  debugLog("Final form data:", safeFormData);
  
  return safeFormData;
}

