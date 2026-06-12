/**
 * Simplified EHR mapper
 * Steps:
 * 1) Collect form fields (keys + labels)
 * 2) Flatten EHR response into key/value entries
 * 3) For each entry, find the best matching form field by score
 * 4) Populate the form data with the best matches
 */


// =============================================================================
// Helpers
// =============================================================================

function normalize(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\\-_`~()@]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function toWords(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function isPrimitive(val) {
  return val !== null && val !== undefined &&
    (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean');
}

function formatByMask(digits, mask) {
  if (!mask || typeof mask !== 'string') return digits;
  let result = '';
  let digitIdx = 0;
  for (let i = 0; i < mask.length; i++) {
    const char = mask[i];
    if (char === '9') {
      if (digitIdx < digits.length) {
        result += digits[digitIdx++];
      } else {
        break;
      }
    } else {
      result += char;
    }
  }
  return result;
}

function formatPhoneNumber(value, mask = '(999) 999-9999') {
  if (!value) return '';
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.substring(1);
  }
  return formatByMask(digits, mask);
}

// =============================================================================
// Step 1: Collect form fields
// =============================================================================

function collectFormFields(form) {
  const fields = [];
  const containerTypes = new Set(['panel', 'well', 'columns', 'tabs', 'container', 'fieldset', 'button', 'htmlelement', 'content', 'table']);

  const process = (component) => {
    if (!component || typeof component !== 'object') return;

    // Recurse into known child containers
    if (Array.isArray(component.components)) component.components.forEach(process);
    if (Array.isArray(component.columns)) {
      component.columns.forEach(col => col?.components?.forEach(process));
    }
    if (Array.isArray(component.rows)) component.rows.forEach(row => row.forEach(process));
    if (Array.isArray(component.tabs)) {
      component.tabs.forEach(tab => tab?.components?.forEach(process));
    }

    if (!component.key || component.input === false) return;
    if (containerTypes.has(component.type)) return;

    const searchParts = new Set();
    searchParts.add(normalize(component.key));
    searchParts.add(toWords(component.key));
    if (component.label) {
      const n = normalize(component.label);
      searchParts.add(n);
      n.split(' ').forEach(w => w && searchParts.add(w));
    }
    if (component.placeholder) searchParts.add(normalize(component.placeholder));

    fields.push({
      key: component.key,
      text: Array.from(searchParts).filter(Boolean),
      type: component.type,
      inputMask: component.inputMask
    });
  };

  if (form?.components) form.components.forEach(process);
  return fields;
}

// =============================================================================
// Step 2: Flatten EHR response
// =============================================================================

function flattenData(data) {
  const entries = [];

  const walk = (node, path = []) => {
    if (isPrimitive(node)) {
      const value = String(node).trim();
      // Skip URLs, system codes, and other metadata
      if (value && 
          !value.startsWith('http://') && 
          !value.startsWith('https://') &&
          !value.startsWith('urn:') &&
          value.length < 200 && // Skip very long values that are likely not user data
          value !== 'official' && // Skip common metadata values
          value !== 'usual' &&
          value !== 'home' &&
          value !== 'work' &&
          value !== 'temp' &&
          value !== 'old') {
        const label = toWords(path.join(' '));
        entries.push({
          path: path.join('.'),
          label,
          value
        });
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, [...path, String(idx)]));
      return;
    }

    if (node && typeof node === 'object') {
      Object.entries(node).forEach(([k, v]) => {
        // Skip obvious metadata keys
        if (['resourceType', 'meta', 'text', 'extension', 'link', 'fullUrl', 'search', 
             'system', 'code', 'display', 'id', 'reference', 'url', 'use', 'type'].includes(k)) return;
        
        // For name arrays, prioritize 'given' and 'family' over 'use'
        if (k === 'name' && Array.isArray(v)) {
          v.forEach((nameItem, idx) => {
            if (nameItem.given) {
              nameItem.given.forEach((given, gIdx) => {
                walk(given, [...path, String(idx), 'given', String(gIdx)]);
              });
            }
            if (nameItem.family) {
              walk(nameItem.family, [...path, String(idx), 'family']);
            }
          });
          return;
        }
        
        // For address arrays, extract city, state, postalCode, country, and line items
        if (k === 'address' && Array.isArray(v)) {
          v.forEach((addressItem, idx) => {
            if (addressItem.city) {
              walk(addressItem.city, [...path, String(idx), 'city']);
            }
            if (addressItem.state) {
              walk(addressItem.state, [...path, String(idx), 'state']);
            }
            if (addressItem.postalCode) {
              walk(addressItem.postalCode, [...path, String(idx), 'postalCode']);
            }
            if (addressItem.country) {
              walk(addressItem.country, [...path, String(idx), 'country']);
            }
            // Handle line array - each line item could be street, apartment, PO box, etc.
            if (addressItem.line && Array.isArray(addressItem.line)) {
              addressItem.line.forEach((line, lIdx) => {
                const lineStr = String(line).trim();
                
                // Try to extract apartment/unit from the line
                const aptPattern = /(?:apt|apartment|unit|ste|suite)\s*[#]?\s*([a-z0-9-]+)/i;
                const aptMatch = lineStr.match(aptPattern);
                if (aptMatch) {
                  // Extract just the apartment part
                  walk(aptMatch[0], [...path, String(idx), 'line', String(lIdx), 'apartment']);
                  // Also extract street part (before apartment)
                  const streetPart = lineStr.substring(0, aptMatch.index).trim();
                  if (streetPart) {
                    walk(streetPart, [...path, String(idx), 'line', String(lIdx), 'street']);
                  }
                } else {
                  // Check for PO box
                  const poboxPattern = 
                    /(?:p\.?\s*o\.?\s*box|po box|post office box)\s*([a-z0-9-]+)/i;
                  const poboxMatch = lineStr.match(poboxPattern);
                  if (poboxMatch) {
                    walk(poboxMatch[0], [...path, String(idx), 'line', String(lIdx), 'pobox']);
                  } else {
                    // Check for RR
                    const rrPattern = /(?:r\.?\s*r\.?\s*|rr|rural route)\s*[#]?\s*([a-z0-9-]+)/i;
                    const rrMatch = lineStr.match(rrPattern);
                    if (rrMatch) {
                      walk(rrMatch[0], [...path, String(idx), 'line', String(lIdx), 'rr']);
                    } else {
                      // Regular street address
                      walk(line, [...path, String(idx), 'line', String(lIdx), 'street']);
                    }
                  }
                }
              });
            }
          });
          return;
        }
        
        // For telecom arrays, extract phone and email separately
        if (k === 'telecom' && Array.isArray(v)) {
          v.forEach((telecomItem, idx) => {
            if (telecomItem.value) {
              // Include the system (phone/email) in the path for better matching
              const system = telecomItem.system || 'unknown';
              walk(telecomItem.value, [...path, String(idx), system]);
            }
          });
          return;
        }
        
        walk(v, [...path, k]);
      });
    }
  };

  walk(data, []);
  return entries;
}

// =============================================================================
// Step 3: Simple match scoring
// =============================================================================

function scoreStrings(a, b) {
  const wa = normalize(a).split(' ').filter(w => w.length > 1);
  const wb = normalize(b).split(' ').filter(w => w.length > 1);
  if (!wa.length || !wb.length) return 0;
  const setA = new Set(wa);
  const setB = new Set(wb);
  let overlap = 0;
  setA.forEach(w => { if (setB.has(w)) overlap++; });
  const score = overlap / Math.max(setA.size, setB.size);
  return score;
}

function findBestField(entry, formFields) {
  let best = null;
  let bestScore = 0;

  // Common FHIR to form field mappings for better matching
  const fhirToFormMap = {
    'given': ['first', 'firstname', 'fname', 'given'],
    'family': ['last', 'lastname', 'lname', 'surname', 'family'],
    'birthdate': ['birth', 'birthdate', 'dob', 'dateofbirth', 'birth date'],
    'gender': ['gender', 'sex'],
    'phone': ['phone', 'telephone', 'mobile', 'day phone', 'dayphone', 'phone no', 'phoneno'],
    'email': ['email', 'e mail', 'email address', 'e mail address', 'mail'],
    'address': ['address', 'street', 'line'],
    'line': ['street', 'address', 'line', 'apartment', 'apt', 'apartment no', 'po box', 'p o box', 'po', 'rr', 'r r', 'rr no', 'r r no'],
    'city': ['city', 'town', 'city town'],
    'state': ['state', 'province'],
    'postalcode': ['postal', 'zip', 'postalcode', 'postal code', 'zipcode', 'zip code'],
    'country': ['country', 'nation'],
    'identifier': ['id', 'identifier', 'mrn', 'medical record', 'patient id']
  };

  // Check if entry path matches common FHIR patterns
  let entryKeywords = [entry.label];
  const entryPathLower = entry.path.toLowerCase();
  Object.keys(fhirToFormMap).forEach(fhirKey => {
    if (entryPathLower.includes(fhirKey)) {
      entryKeywords = entryKeywords.concat(fhirToFormMap[fhirKey]);
    }
  });
  
  // Special handling for email - check if path contains 'email' system
  if (entryPathLower.includes('email')) {
    entryKeywords = entryKeywords.concat(fhirToFormMap['email']);
  }
  
  // Special handling for phone - check if path contains 'phone' system
  if (entryPathLower.includes('phone')) {
    entryKeywords = entryKeywords.concat(fhirToFormMap['phone']);
  }
  
  // Special handling for address line items
  if (entryPathLower.includes('line')) {
    entryKeywords = entryKeywords.concat(fhirToFormMap['line']);
    
    // Try to parse address line to extract specific components
    const addressValue = entry.value.toLowerCase();
    
    // Check for apartment/unit patterns
    const aptMatch = addressValue.match(/(?:apt|apartment|unit|ste|suite)\s*[#]?\s*([a-z0-9-]+)/i);
    if (aptMatch && entryKeywords.some(k => k.includes('apartment') || k.includes('apt'))) {
      // This might be an apartment number
      entryKeywords = entryKeywords.concat(['apartment', 'apt', 'apartment no', 'unit']);
    }
    
    // Check for PO box patterns
    const poboxPattern = /(?:p\.?\s*o\.?\s*box|po box|post office box)\s*([a-z0-9-]+)/i;
    const poboxMatch = addressValue.match(poboxPattern);
    if (poboxMatch && entryKeywords.some(k => k.includes('box') || k.includes('po'))) {
      entryKeywords = entryKeywords.concat(['po box', 'p o box', 'po', 'post office']);
    }
    
    // Check for RR patterns
    const rrMatch = addressValue.match(/(?:r\.?\s*r\.?\s*|rr|rural route)\s*[#]?\s*([a-z0-9-]+)/i);
    if (rrMatch && entryKeywords.some(k => k.includes('rr') || k.includes('r r'))) {
      entryKeywords = entryKeywords.concat(['rr', 'r r', 'rr no', 'r r no', 'rural route']);
    }
  }

  formFields.forEach(field => {
    let fieldScore = 0;
    
    // Check against all entry keywords
    entryKeywords.forEach(keyword => {
      const score = field.text.reduce(
        (acc, t) => Math.max(acc, scoreStrings(keyword, t)),
        0
      );
      fieldScore = Math.max(fieldScore, score);
    });
    
    // Boost score for exact key matches
    if (field.key && entry.path.toLowerCase().includes(field.key.toLowerCase())) {
      fieldScore = Math.max(fieldScore, 0.8);
    }
    
    // Special boost for address line matching
    if (entryPathLower.includes('line')) {
      const fieldKeyLower = field.key ? field.key.toLowerCase() : '';
      const fieldTextLower = field.text.join(' ').toLowerCase();
      
      // Check if field is specifically for street (not apartment/box/rr)
      if ((fieldKeyLower.includes('street') || fieldTextLower.includes('street')) && 
          !fieldKeyLower.includes('apartment') && !fieldKeyLower.includes('box') && !fieldKeyLower.includes('rr')) {
        // This is likely the main street address field
        const streetScore = scoreStrings(entry.value, field.text.join(' '));
        fieldScore = Math.max(fieldScore, streetScore * 1.2); // Boost street matches
      }
      
      // Check if field is for apartment
      if (fieldKeyLower.includes('apartment') || fieldKeyLower.includes('apt') || 
          fieldTextLower.includes('apartment') || fieldTextLower.includes('apt')) {
        const aptPattern = /(?:apt|apartment|unit|ste|suite)\s*[#]?\s*([a-z0-9-]+)/i;
        if (aptPattern.test(entry.value)) {
          fieldScore = Math.max(fieldScore, 0.9); // High score for apartment fields
        }
      }
      
      // Check if field is for PO box
      if (fieldKeyLower.includes('box') || fieldKeyLower.includes('po') || 
          fieldTextLower.includes('box') || fieldTextLower.includes('po')) {
        const poboxPattern = /(?:p\.?\s*o\.?\s*box|po box|post office box)/i;
        if (poboxPattern.test(entry.value)) {
          fieldScore = Math.max(fieldScore, 0.9); // High score for PO box fields
        }
      }
      
      // Check if field is for RR
      if (fieldKeyLower.includes('rr') || fieldTextLower.includes('rr') || fieldTextLower.includes('r r')) {
        const rrPattern = /(?:r\.?\s*r\.?\s*|rr|rural route)/i;
        if (rrPattern.test(entry.value)) {
          fieldScore = Math.max(fieldScore, 0.9); // High score for RR fields
        }
      }
    }
    
    if (fieldScore > bestScore) {
      bestScore = fieldScore;
      best = field;
    }
  });

  return { field: best, score: bestScore };
}

// =============================================================================
// Step 4: Map values
// =============================================================================

export function mapPatientToFormio(data, form) {
  if (!data || !form) return {};

  const formFields = collectFormFields(form);
  const flatData = flattenData(data);

  const assignments = {};
  const used = new Set();
  const matches = [];

  // Directly assign patient fhir ID to patientId field if it exists
  if (data.id) {
    const patientIdField = formFields.find(f => f.key === 'patientId');
    if (patientIdField) {
      assignments['patientId'] = String(data.id);
      used.add('patientId');
      matches.push({ field: 'patientId', from: 'id', score: 1.0 });
    } else {
      // Fallback: push to flatData to match dynamically
      flatData.push({
        path: 'id',
        label: 'patient fhir number id',
        value: String(data.id)
      });
    }
  }

  flatData.forEach(entry => {
    const { field, score } = findBestField(entry, formFields);
    // Require minimum score of 0.3 to avoid poor matches
    if (field && score >= 0.3) {
      if (!used.has(field.key)) {
        let value = entry.value;
        // Format phone number to match the inputMask if it's a phone field
        if (field.type === 'phoneNumber' || field.key.toLowerCase().includes('phone') || (field.inputMask && field.inputMask.includes('9'))) {
          value = formatPhoneNumber(value, field.inputMask);
        }
        assignments[field.key] = value;
        used.add(field.key);
        matches.push({ field: field.key, from: entry.path, score: Number(score.toFixed(2)) });
      }
    }
  });

  return assignments;
}
