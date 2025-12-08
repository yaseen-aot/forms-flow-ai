/**
 * EHR Mapper Utility
 * Maps FHIR Patient demographics to Form.io form fields
 * Based on the Foundry project implementation
 */

import { debugLog } from './ehrConfig';

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
    return {};
  }

  // Extract name (prefer official name, fallback to first name)
  const name = patient.name?.find(n => n.use === 'official') || 
               patient.name?.[0] || {};
  const givenNames = name.given || [];
  
  // Extract address (prefer home address, fallback to first address)
  const address = patient.address?.find(a => a.use === 'home') || 
                  patient.address?.[0] || {};
  const addressLines = address.line || [];
  
  // Extract contact info
  const phone = patient.telecom?.find(t => t.system === 'phone');
  const email = patient.telecom?.find(t => t.system === 'email');
  
  // Extract identifiers
  const mrn = patient.identifier?.find(
    id => id.type?.coding?.some(c => c.code === 'MR')
  );
  
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
  
  // Base mapping of patient data
  const patientData = {
    // Name fields - common variations
    firstName: givenNames[0] || '',
    firstname: givenNames[0] || '',
    'first-name': givenNames[0] || '',
    middleName: givenNames[1] || '',
    middlename: givenNames[1] || '',
    'middle-name': givenNames[1] || '',
    lastName: name.family || '',
    lastname: name.family || '',
    'last-name': name.family || '',
    namePrefix: name.prefix?.[0] || '',
    nameprefix: name.prefix?.[0] || '',
    prefix: name.prefix?.[0] || '',
    nameSuffix: name.suffix?.[0] || '',
    namesuffix: name.suffix?.[0] || '',
    suffix: name.suffix?.[0] || '',
    fullName: `${givenNames.join(' ')} ${name.family}`.trim(),
    fullname: `${givenNames.join(' ')} ${name.family}`.trim(),
    
    // Demographics
    dateOfBirth: patient.birthDate || '',
    dateofbirth: patient.birthDate || '',
    dob: patient.birthDate || '',
    birthDate: patient.birthDate || '',
    birthdate: patient.birthDate || '',
    age: age !== null ? age.toString() : '',
    gender: patient.gender ? 
      patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '',
    sex: patient.gender ? 
      patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '',
    
    // Address
    addressLine1: addressLines[0] || '',
    addressline1: addressLines[0] || '',
    'address-line-1': addressLines[0] || '',
    address1: addressLines[0] || '',
    addressLine2: addressLines[1] || '',
    addressline2: addressLines[1] || '',
    'address-line-2': addressLines[1] || '',
    address2: addressLines[1] || '',
    city: address.city || '',
    state: address.state || '',
    zipCode: address.postalCode || '',
    zipcode: address.postalCode || '',
    'zip-code': address.postalCode || '',
    postalCode: address.postalCode || '',
    postalcode: address.postalCode || '',
    zip: address.postalCode || '',
    country: address.country || '',
    
    // Contact
    phone: phone?.value || '',
    phoneNumber: phone?.value || '',
    phonenumber: phone?.value || '',
    'phone-number': phone?.value || '',
    telephone: phone?.value || '',
    email: email?.value || '',
    emailAddress: email?.value || '',
    emailaddress: email?.value || '',
    'email-address': email?.value || '',
    
    // Identifiers
    medicalRecordNumber: mrn?.value || '',
    medicalrecordnumber: mrn?.value || '',
    'medical-record-number': mrn?.value || '',
    mrn: mrn?.value || '',
    patientId: patient.id || '',
    patientid: patient.id || '',
    'patient-id': patient.id || '',
    
    // Additional demographics
    maritalStatus: patient.maritalStatus?.text || 
                   patient.maritalStatus?.coding?.[0]?.display || '',
    maritalstatus: patient.maritalStatus?.text || 
                   patient.maritalStatus?.coding?.[0]?.display || '',
    preferredLanguage: patient.communication?.[0]?.language?.text || 
                       patient.communication?.[0]?.language?.coding?.[0]?.display || '',
    preferredlanguage: patient.communication?.[0]?.language?.text || 
                       patient.communication?.[0]?.language?.coding?.[0]?.display || ''
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
  
  // Recursively process components (handles nested components, panels, etc.)
  const processComponents = (comps) => {
    if (!Array.isArray(comps)) return;
    
    comps.forEach(component => {
      if (component.key) {
        const key = component.key;
        
        // Try exact match first
        if (Object.prototype.hasOwnProperty.call(patientData, key)) {
          formData[key] = patientData[key];
          matchedFields.push({ field: key, value: patientData[key], method: 'exact' });
          return;
        }
        
        // Try case-insensitive match
        const lowerKey = key.toLowerCase();
        for (const [patientKey, value] of Object.entries(patientData)) {
          if (patientKey.toLowerCase() === lowerKey && value) {
            formData[key] = value;
            matchedFields.push({ field: key, value: value, method: 'case-insensitive', matchedKey: patientKey });
            return;
          }
        }
        
        // Try partial matching for common patterns
        // e.g., "patientFirstName" matches "firstName"
        let partialMatch = false;
        if (lowerKey.includes('first') && lowerKey.includes('name')) {
          if (patientData.firstName) {
            formData[key] = patientData.firstName;
            matchedFields.push({ field: key, value: patientData.firstName, method: 'partial-firstname' });
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
          if (patientData.phone) {
            formData[key] = patientData.phone;
            matchedFields.push({ field: key, value: patientData.phone, method: 'partial-phone' });
            partialMatch = true;
          }
        } else if (lowerKey.includes('email')) {
          if (patientData.email) {
            formData[key] = patientData.email;
            matchedFields.push({ field: key, value: patientData.email, method: 'partial-email' });
            partialMatch = true;
          }
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
        
        if (!partialMatch) {
          unmatchedFields.push(key);
        }
      }
      
      // Process nested components (for panels, columns, etc.)
      if (component.components && Array.isArray(component.components)) {
        processComponents(component.components);
      }
    });
  };
  
  processComponents(components);
  
  debugLog("=== Field Mapping Results ===");
  debugLog("Matched fields:", matchedFields);
  debugLog("Unmatched fields:", unmatchedFields);
  debugLog("Total form fields processed:", matchedFields.length + unmatchedFields.length);
  debugLog("Successfully mapped:", matchedFields.length);
  debugLog("Final form data:", formData);
  
  return formData;
}

