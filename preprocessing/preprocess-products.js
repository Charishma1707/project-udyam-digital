/**
 * ============================================================================
 * PREPROCESSING MODULE: Product Catalogue Preprocessor (preprocess-products.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Reads `product_catalogue.csv` and cleans/transforms raw CSV strings into strongly-typed
 * JavaScript objects before inserting into PostgreSQL or in-memory caches.
 * 
 * TRANSFORMATIONS APPLIED:
 * 1. Target Segments: Short codes like "micro;prof" -> ["Micro Retail & Services", "Professional Offices"]
 * 2. Dependencies: Pipe-separated "P01|P02" -> ["P01", "P02"]
 * 3. City Tiers: "1;2" -> [1, 2]
 * 4. Numeric fields: Prices, setup fees, contract months, and install days parsed into numbers
 * 5. Requires GSTIN: "Y"/"N" converted to boolean true/false
 * 
 * HOW TO USE:
 * const { preprocessProducts } = require('./preprocess-products');
 * const products = preprocessProducts(); // returns Array of 25 normalized products
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { normalizeSegmentList } = require('./normalize-segments');

// Source directory containing raw competition data files
const DATA_DIR = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data');

// ============================================================================
// HELPER COERCION FUNCTIONS
// ============================================================================

function cleanStr(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function cleanInt(val) {
  const s = cleanStr(val);
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function cleanFloat(val) {
  const s = cleanStr(val);
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function cleanBool(val) {
  const s = cleanStr(val);
  if (!s) return false;
  const upper = s.toUpperCase();
  return upper === 'Y' || upper === 'YES' || upper === 'TRUE' || upper === '1';
}

function parseDependencies(raw) {
  if (!raw) return [];
  return String(raw)
    .split('|')
    .map(x => x.trim())
    .filter(Boolean);
}

function parseCityTiers(raw) {
  if (!raw) return [1, 2];
  return String(raw)
    .split(/[;,]/)
    .map(x => parseInt(x.trim(), 10))
    .filter(n => !isNaN(n));
}

// ============================================================================
// MAIN PREPROCESSING FUNCTION
// ============================================================================

/**
 * Reads and cleans product_catalogue.csv.
 * @param {string} [filePath] - Optional path to product_catalogue.csv
 * @returns {Array<Object>} List of cleaned, normalized product records
 */
function preprocessProducts(filePath = path.join(DATA_DIR, 'product_catalogue.csv')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Product catalogue CSV not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleaned = records.map((r) => {
    const rawSegments = cleanStr(r.target_segments);
    const normalizedSegments = normalizeSegmentList(rawSegments);
    const dependencies = parseDependencies(cleanStr(r.requires_one_of));
    const cityTiers = parseCityTiers(cleanStr(r.available_city_tiers));

    return {
      product_id: cleanStr(r.product_id),
      category: cleanStr(r.category),
      product_name: cleanStr(r.product_name),
      description: cleanStr(r.description),
      unit: cleanStr(r.unit),
      price_min_inr_per_month: cleanFloat(r.price_min_inr_per_month),
      price_max_inr_per_month: cleanFloat(r.price_max_inr_per_month),
      one_time_setup_inr: cleanFloat(r.one_time_setup_inr) || 0,
      min_contract_months: cleanInt(r.min_contract_months) || 1,
      available_city_tiers: cityTiers,
      min_employees: cleanInt(r.min_employees) || 1,
      min_sites: cleanInt(r.min_sites) || 1,
      requires_gstin: cleanBool(r.requires_gstin),
      requires_one_of: dependencies,
      typical_install_days: cleanInt(r.typical_install_days) || 3,
      target_segments: normalizedSegments
    };
  });

  return cleaned;
}

module.exports = {
  preprocessProducts
};
