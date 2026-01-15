/**
 * Simplified EHR mapper
 * Steps:
 * 1) Collect form fields (keys + labels)
 * 2) Flatten EHR response into key/value entries
 * 3) For each entry, find the best matching form field by score
 * 4) Populate the form data with the best matches
 */

import { debugLog } from './config';

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
      text: Array.from(searchParts).filter(Boolean)
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
      if (value) {
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
        if (['resourceType', 'meta', 'text', 'extension', 'link', 'fullUrl', 'search'].includes(k)) return;
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

  formFields.forEach(field => {
    const fieldScore = field.text.reduce(
      (acc, t) => Math.max(acc, scoreStrings(entry.label, t)),
      0
    );
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

  flatData.forEach(entry => {
    const { field, score } = findBestField(entry, formFields);
    if (field && score > 0) {
      if (!used.has(field.key)) {
        assignments[field.key] = entry.value;
        used.add(field.key);
        matches.push({ field: field.key, from: entry.path, score: Number(score.toFixed(2)) });
      }
    }
  });

  debugLog(`Mapped ${matches.length} fields`, matches);
  return assignments;
}
