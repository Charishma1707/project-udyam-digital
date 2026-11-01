/**
 * ============================================================================
 * PREPROCESSING MODULE: Mock Udyam Registry Preprocessor (preprocess-udyam.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Cleans and validates the 2,723+ MSME government Udyam registration records (`mock_udyam_registry.csv`).
 * 
 * WHAT IS UDYAM?
 * Udyam Registration is the government identification certificate issued to Micro, Small,
 * and Medium Enterprises (MSMEs) in India.
 * 
 * WHY IS UDYAM IMPORTANT IN AIRTEL BUSINESS?
 * 1. Priority Business SLAs: MSME customers receive dedicated customer relationship management.
 * 2. Subsidized Enterprise Plans: Special promotional tariffs and government-subsidized rates.
 * 3. Priority Installation: Accelerated deployment queues for registered enterprises.
 * 
 * FORMAT:
 * "UDYAM-XX-00-0000000" (e.g., UDYAM-MH-01-0012345)
 * 
 * HOW TO USE:
 * const { preprocessUdyam, isValidUdyamFormat } = require('./preprocess-udyam');
 * const udyamRecords = preprocessUdyam(); // returns 2,723 normalized Udyam entities
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
 * Validates official Indian MSME Udyam registration number format.
 * Format regex: "UDYAM-XX-00-0000000" (case insensitive)
 * - Prefix: UDYAM-
 * - State Code: 2 letters (e.g. MH, DL, TS)
 * - District Code: 2 digits
 * - Sequence: 7 digits
 */
function isValidUdyamFormat(udyam) {
  if (!udyam) return false;
  return /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/i.test(udyam);
}

// ============================================================================
// MAIN PREPROCESSING FUNCTION
// ============================================================================

/**
 * Reads and cleans mock_udyam_registry.csv.
 * @param {string} [filePath]
 * @returns {Array<Object>} List of cleaned Udyam registry records
 */
function preprocessUdyam(filePath = path.join(DATA_DIR, 'mock_udyam_registry.csv')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Udyam registry CSV not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleaned = records.map((r) => {
    const rawUdyam = cleanStr(r.udyam_number);
    const udyam_number = rawUdyam ? rawUdyam.toUpperCase() : null;

    return {
      udyam_number,
      enterprise_name: cleanStr(r.enterprise_name),
      enterprise_type: cleanStr(r.enterprise_type),
      major_activity: cleanStr(r.major_activity),
      nic_description: cleanStr(r.nic_description),
      state: cleanStr(r.state),
      city: cleanStr(r.city),
      date_of_registration: cleanDate(r.date_of_registration),
      is_valid_format: isValidUdyamFormat(udyam_number)
    };
  });

  return cleaned;
}

module.exports = {
  preprocessUdyam,
  isValidUdyamFormat
};
