/**
 * EHR Mapper Utility
 * Maps FHIR Patient demographics to Form.io form fields
 * Based on the Foundry project implementation
 */

import { search } from 'fast-fuzzy';
import { debugLog } from './config';

/**
 * Safely convert a value to string, returning empty string for objects/null/undefined
 * @param {any} value - Value to convert
 * @returns {string} String value or empty string
 */
function safeString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  if (typeof value === 'function') return '';
  
  const str = String(value);
  if (str === '[object Object]' || str.startsWith('[object ')) return '';
  
  return str;
}

/**
 * Extract name parts from patient resource
 */
function extractName(patient) {
  const name = patient.name?.find(n => n.use === 'official') || patient.name?.[0] || {};
  
  let givenNames = [];
  if (Array.isArray(name.given)) {
    givenNames = name.given.map(n => typeof n === 'string' ? n : '');
  } else if (typeof name.given === 'string') {
    givenNames = [name.given];
  }
  
  return {
    givenNames,
    familyName: typeof name.family === 'string' ? name.family : '',
    prefix: safeString(name.prefix?.[0]),
    suffix: safeString(name.suffix?.[0])
  };
}

/**
 * Extract address parts from patient resource
 */
function extractAddress(patient) {
  const address = patient.address?.find(a => a.use === 'home') || patient.address?.[0] || {};
  
  let addressLines = [];
  if (Array.isArray(address.line)) {
    addressLines = address.line.map(l => typeof l === 'string' ? l : '');
  }
  
  return {
    address,
    addressLines
  };
}

/**
 * Extract telecom info
 */
function extractTelecom(patient) {
  const phoneObj = patient.telecom?.find(t => t.system === 'phone');
  const emailObj = patient.telecom?.find(t => t.system === 'email');
  
  return {
    phone: typeof phoneObj?.value === 'string' ? phoneObj.value : '',
    email: typeof emailObj?.value === 'string' ? emailObj.value : ''
  };
}

/**
 * Calculate age from birthDate
 */
function calculateAge(birthDate) {
  if (!birthDate) return '';
  
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age.toString();
}

/**
 * Extract standard patient data into a flat object with semantic keys
 * This normalizes the complex FHIR structure into a simple key-value map
 */
function normalizePatientData(patient) {
  const { givenNames, familyName, prefix, suffix } = extractName(patient);
  const { address, addressLines } = extractAddress(patient);
  const { phone, email } = extractTelecom(patient);
  
  const mrnObj = patient.identifier?.find(id => id.type?.coding?.some(c => c.code === 'MR'));
  const mrn = typeof mrnObj?.value === 'string' ? mrnObj.value : '';
  
  const gender = typeof patient.gender === 'string' && patient.gender ? 
    patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '';

  // Return a flat object with standardized keys
  return {
    firstName: safeString(givenNames[0]),
    middleName: safeString(givenNames[1]),
    lastName: safeString(familyName),
    namePrefix: prefix,
    nameSuffix: suffix,
    fullName: `${givenNames.join(' ')} ${familyName}`.trim(),
    
    dateOfBirth: safeString(patient.birthDate),
    age: calculateAge(patient.birthDate),
    gender: gender,
    
    addressLine1: safeString(addressLines[0]),
    addressLine2: safeString(addressLines[1]),
    city: safeString(address.city),
    state: safeString(address.state),
    zipCode: safeString(address.postalCode),
    country: safeString(address.country),
    // Composite field useful for some forms
    provinceCountry: address.state && address.country ? 
      `${address.state} / ${address.country}` : 
      (address.state || address.country || ''),
    
    phone: phone,
    email: email,
    
    medicalRecordNumber: mrn,
    patientId: safeString(patient.id),
    
    maritalStatus: safeString(patient.maritalStatus?.text) || 
                   safeString(patient.maritalStatus?.coding?.[0]?.display),
    preferredLanguage: safeString(patient.communication?.[0]?.language?.text) || 
                       safeString(patient.communication?.[0]?.language?.coding?.[0]?.display)
  };
}

/**
 * Dictionary of synonyms for fuzzy matching
 * Maps standardized data keys to potential keywords found in form labels/keys
 */
const KEY_SYNONYMS = {
  firstName: ['first name', 'first', 'given name', 'given', 'fname'],
  lastName: ['last name', 'family name', 'surname', 'lname'],
  middleName: ['middle name', 'middle', 'mname'],
  fullName: ['full name', 'fullname', 'name'],
  namePrefix: ['prefix', 'title'],
  nameSuffix: ['suffix'],

  dateOfBirth: ['date of birth', 'dob', 'birth date', 'birthdate'],
  age: ['age', 'years'],
  gender: ['gender', 'sex'],

  addressLine1: ['address', 'street', 'line 1', 'address line 1', 'street address', 'apartment', 'p.o. box', 'po box', 'rr no', 'r.r. no', 'address line', 'street line'],
  addressLine2: ['address line 2', 'line 2', 'apt', 'apartment', 'suite'],
  city: ['city', 'town', 'city town', 'city/ town'],
  state: ['state', 'province', 'region', 'territory'],
  zipCode: ['zip', 'postal code', 'postcode', 'zip code'],
  country: ['country'],
  provinceCountry: ['province country', 'state country', 'province / country'],

  phone: ['phone', 'telephone', 'mobile', 'cell', 'day phone', 'day phone no', 'phone no', 'phone number', 'telephone number', 'contact phone'],
  email: ['email', 'e-mail', 'e-mail address', 'email address', 'mail'],

  medicalRecordNumber: ['mrn', 'medical record number', 'record number'],
  patientId: ['patient id', 'patient identifier'],

  maritalStatus: ['marital status', 'marital'],
  preferredLanguage: ['preferred language', 'language']
};

/**
 * Build searchable entries from normalized patient data
 * Creates multiple text variations for each data key to improve matching
 */
function buildSearchableEntries(patientData) {
  const entries = [];

  Object.entries(patientData).forEach(([key, value]) => {
    if (!value) return;

    const base = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .toLowerCase()
      .trim();

    const synonyms = new Set([
      base,
      key.toLowerCase(),
      ...(KEY_SYNONYMS[key] || [])
    ]);

    synonyms.forEach((text) => {
      if (text) {
        entries.push({
          key,
          text
        });
      }
    });
  });

  return entries;
}

/**
 * Map FHIR Patient resource to Form.io form data structure
 */
export function mapPatientToFormio(patient, form) {
  if (!patient) return {};

  debugLog("Raw patient data:", JSON.stringify(patient, null, 2));

  // 1. Normalize patient data into a flat key-value map
  const patientData = normalizePatientData(patient);

  // 2. Build searchable entries for fuzzy matching
  const searchableEntries = buildSearchableEntries(patientData);

  // If we don't have a form definition or no searchable entries, return normalized data
  if (!form || !form.components || !searchableEntries.length) {
    return patientData;
  }

  const formData = {};
  const matchedFields = [];
  const SCORE_THRESHOLD = 0.5; // Lower threshold for better field matching

  const collectComponentCandidates = (component) => {
    const candidates = new Set();
    
    // Helper to normalize text for matching
    const normalize = (text) => {
      if (!text) return '';
      return text
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ') // Replace punctuation with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    };
    
    if (component.key) {
      candidates.add(component.key);
      candidates.add(normalize(component.key));
      candidates.add(component.key.replace(/[_-]/g, ' '));
    }
    if (component.label) {
      candidates.add(component.label);
      candidates.add(normalize(component.label));
      // Also add partial matches for long labels
      const normalizedLabel = normalize(component.label);
      const words = normalizedLabel.split(' ').filter(w => w.length > 2);
      words.forEach(word => candidates.add(word));
    }
    if (component.placeholder) {
      candidates.add(component.placeholder);
      candidates.add(normalize(component.placeholder));
    }
    if (component.properties) {
      Object.values(component.properties).forEach((val) => {
        if (typeof val === 'string') {
          candidates.add(val);
          candidates.add(normalize(val));
        }
      });
    }
    return Array.from(candidates).filter(Boolean);
  };

  const processComponents = (comps) => {
    if (!Array.isArray(comps)) return;

    comps.forEach((component) => {
      // Traverse container components
      if (component.columns && Array.isArray(component.columns)) {
        component.columns.forEach((col) => processComponents(col.components));
      } else if (component.components && Array.isArray(component.components)) {
        processComponents(component.components);
      } else if (component.tabs && Array.isArray(component.tabs)) {
        component.tabs.forEach((tab) => processComponents(tab.components));
      }

      if (!component.key || component.input === false) return;
      if (
        ['panel', 'well', 'columns', 'tabs', 'container', 'fieldset', 'button', 'htmlelement', 'content'].includes(
          component.type
        )
      ) {
        return;
      }

      // Direct key match (case-insensitive)
      const directValue = Object.entries(patientData).find(
        ([dataKey]) => dataKey.toLowerCase() === component.key.toLowerCase()
      );
      if (directValue && directValue[1]) {
        formData[component.key] = directValue[1];
        matchedFields.push({
          field: component.key,
          mappedFrom: directValue[0],
          value: directValue[1],
          score: 1
        });
        return;
      }

      const candidates = collectComponentCandidates(component);
      let bestMatch = null;
      let bestScore = 0;
      
      // Determine if this component is email-related based on key/label (for all candidates)
      const componentKeyLower = component.key?.toLowerCase() || '';
      const componentLabelLower = component.label?.toLowerCase() || '';
      const isEmailComponent = componentKeyLower.includes('email') || componentLabelLower.includes('email');
      const isPhoneComponent = componentKeyLower.includes('phone') || componentLabelLower.includes('phone') || 
                               componentLabelLower.includes('telephone');

      candidates.forEach((candidate) => {
        if (!candidate || candidate.length < 2) return;
        
        // Normalize candidate for better matching
        const normalizedCandidate = candidate
          .toLowerCase()
          .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (!normalizedCandidate) return;
        
        // Use fast-fuzzy search function to find matches
        // The search function returns items sorted by relevance (best match first)
        const results = search(normalizedCandidate, searchableEntries, {
          keySelector: (item) => item.text,
          threshold: 0.5 // Lower threshold for better matching
        });
        
        if (results && results.length) {
          // Results are sorted by score (best first)
          // Each result is the item object from searchableEntries
          const topResult = results[0];
          if (topResult && topResult.key) {
            const matchedKey = topResult.key;
            
            // Additional validation: ensure the match makes semantic sense
            // Prevent cross-category mismatches (e.g., email matching address)
            const candidateLower = normalizedCandidate;
            
            // More specific email detection - handle normalized variations
            // "E-mail Address" becomes "e mail address" after normalization
            // Check for email patterns: "email", "e-mail", "e mail", or "mail" without address/street
            // OR if the component itself is email-related (all candidates from email component are email-related)
            const hasMail = candidateLower.includes('mail');
            const hasAddress = candidateLower.includes('address');
            const hasStreet = candidateLower.includes('street');
            const hasEmail = candidateLower.includes('email');
            const hasEMail = candidateLower.includes('e-mail') || candidateLower.includes('e mail');
            // Email-related if component is email-related OR candidate has email/e-mail pattern
            // OR has mail without address/street context
            const isEmailRelated = isEmailComponent || hasEmail || hasEMail || 
                                  (hasMail && !hasAddress && !hasStreet);
            
            // Phone-related if component is phone-related OR candidate has phone patterns
            const isPhoneRelated = isPhoneComponent || 
                                  candidateLower.includes('phone') || 
                                  candidateLower.includes('telephone') || 
                                  candidateLower.includes('tel') ||
                                  candidateLower.includes('day phone');
            
            const isAddressRelated = candidateLower.includes('address') || 
                                    candidateLower.includes('street') || 
                                    candidateLower.includes('apartment') ||
                                    candidateLower.includes('po box') ||
                                    candidateLower.includes('p o box') ||
                                    candidateLower.includes('rr no') ||
                                    candidateLower.includes('r r no') ||
                                    candidateLower.includes('city') || 
                                    candidateLower.includes('town') || 
                                    candidateLower.includes('zip') || 
                                    candidateLower.includes('postal') ||
                                    candidateLower.includes('province') ||
                                    candidateLower.includes('state');
            
            // Validate that the matched key is in the same category
            let isValidMatch = true;
            const addressFields = ['addressLine1', 'addressLine2', 'city', 'state', 'zipCode', 'country', 'provinceCountry'];
            
            // Priority: Email-related candidates should ONLY match email (even if they also contain "address")
            if (isEmailRelated) {
              if (matchedKey !== 'email') {
                isValidMatch = false;
                debugLog(
                  `Rejecting cross-category: email candidate "${candidateLower}" -> "${matchedKey}"`
                );
              }
            } else if (isPhoneRelated && matchedKey !== 'phone') {
              isValidMatch = false;
              debugLog(
                `Rejecting cross-category: phone candidate "${candidateLower}" -> "${matchedKey}"`
              );
            } else if (isAddressRelated && !addressFields.includes(matchedKey)) {
              isValidMatch = false;
              debugLog(
                `Rejecting cross-category: address candidate "${candidateLower}" -> "${matchedKey}"`
              );
            }
            
            // Use position as score indicator - first result is best (score = 1.0)
            // We'll use a high score since it passed the threshold
            const score = 0.9; // High confidence for threshold-passing matches
            if (isValidMatch && score > bestScore) {
              bestScore = score;
              bestMatch = matchedKey;
            }
          }
        }
      });

      if (bestMatch && bestScore >= SCORE_THRESHOLD && patientData[bestMatch]) {
        formData[component.key] = patientData[bestMatch];
        matchedFields.push({
          field: component.key,
          mappedFrom: bestMatch,
          value: patientData[bestMatch],
          score: bestScore
        });
      }
    });
  };

  processComponents(form.components);
  debugLog(`Mapped ${matchedFields.length} fields`, matchedFields);
  return formData;
}
