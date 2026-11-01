/**
 * ============================================================================
 * PREPROCESSING MODULE: Mock GSTIN Registry Preprocessor (preprocess-gst.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Cleans and validates the 3,534+ government mock GSTIN records (`mock_gstin_registry.csv`).
 * 
 * WHY IS GSTIN IMPORTANT IN AIRTEL BUSINESS?
 * 1. Enterprise Products: Solutions like 1G Biz Fibre and Internet Leased Lines (ILL)
 *    require commercial billing with a valid GSTIN.
 * 2. Tax Input Credit: Customers with GSTIN receive an 18% GST input credit on their monthly telecom bill.
 * 3. Identity Verification: Cross-referencing GSTIN verifies the legal entity name and state.
 * 
 * HOW TO USE:
 * const { preprocessGst, isValidGstinFormat } = require('./preprocess-gst');
 * const gstRecords = preprocessGst(); // returns 3,534 normalized GSTIN entities
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DATA_DIR = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data');

// ============================================================================
// HELPER VALIDATION & CLEANING FUNCTIONS
// ============================================================================

function cleanStr(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function cleanDate(val) {
  const s = cleanStr(val);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/**
 * Validates official Indian GSTIN format.
 * Structure: 15 alphanumeric characters:
 * - 2 digits (State code, e.g. 29 for Karnataka, 36 for Telangana)
 * - 10 characters (PAN number: 5 letters + 4 digits + 1 letter)
 * - 1 character (Entity number of the same PAN holder in state)
 * - 1 character ('Z' by default)
 * - 1 character (Checksum digit)
 */
function isValidGstinFormat(gstin) {
  if (!gstin) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z0-9][1-9A-Z]Z[0-9A-Z]$/i.test(gstin);
}

// ============================================================================
// MAIN PREPROCESSING FUNCTION
// ============================================================================

/**
 * Reads and cleans mock_gstin_registry.csv.
 * @param {string} [filePath]
 * @returns {Array<Object>} List of cleaned GSTIN registry records
 */
function preprocessGst(filePath = path.join(DATA_DIR, 'mock_gstin_registry.csv')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`GSTIN registry CSV not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleaned = records.map((r) => {
    const rawGstin = cleanStr(r.gstin);
    const gstin = rawGstin ? rawGstin.toUpperCase() : null;

    return {
      gstin,
      legal_name: cleanStr(r.legal_name),
      trade_name: cleanStr(r.trade_name),
      constitution: cleanStr(r.constitution),
      principal_place_of_business: cleanStr(r.principal_place_of_business),
      state: cleanStr(r.state),
      registration_date: cleanDate(r.registration_date),
      status: cleanStr(r.status) || 'Active',
      is_valid_format: isValidGstinFormat(gstin)
    };
  });

  return cleaned;
}

module.exports = {
  preprocessGst,
  isValidGstinFormat
};
