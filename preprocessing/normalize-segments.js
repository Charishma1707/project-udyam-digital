/**
 * ============================================================================
 * PREPROCESSING MODULE: Segment Normalization (normalize-segments.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * This utility standardizes all business segment names across different datasets.
 * 
 * THE PROBLEM IT SOLVES:
 * - In `product_catalogue.csv`, target segments use short codes: "MICRO", "PROF", "MFG", "MULTI"
 * - In `smb_leads.csv`, target segments use phrases: "Small manufacturers", "Professional offices", etc.
 * 
 * THE SOLUTION:
 * This file maps EVERY variant into one of the 4 official canonical names:
 * 1. "Micro Retail & Services"  (Kirana, bakeries, salons, cafes, clinics)
 * 2. "Professional Offices"     (Lawyers, CAs, architectural studios, agencies)
 * 3. "Small Manufacturing"      (Textile units, factories, plastic moulding)
 * 4. "Multi-site Businesses"    (Retail chains, pharmacy chains, hotel groups)
 * 
 * EXPORTED FUNCTIONS:
 * - normalizeSegment(val): Takes a single string and returns the canonical name.
 * - normalizeSegmentList(raw): Takes semicolon/comma lists (e.g. "micro;prof") and returns an array.
 * ============================================================================
 */

// Mapping dictionary from abbreviations and variants to official canonical segment names
const SEGMENT_CODE_MAP = {
  MICRO: "Micro Retail & Services",
  PROF: "Professional Offices",
  MFG: "Small Manufacturing",
  MULTI: "Multi-site Businesses",
  "MICRO RETAIL & SERVICES": "Micro Retail & Services",
  "PROFESSIONAL OFFICES": "Professional Offices",
  "SMALL MANUFACTURING": "Small Manufacturing",
  "SMALL MANUFACTURERS": "Small Manufacturing",
  "MULTI-SITE BUSINESSES": "Multi-site Businesses",
  "SMALL MULTI-SITE BUSINESSES": "Multi-site Businesses"
};

// The 4 official Airtel Business canonical segments
const CANONICAL_SEGMENTS = [
  "Micro Retail & Services",
  "Professional Offices",
  "Small Manufacturing",
  "Multi-site Businesses"
];

/**
 * Normalizes a single segment name.
 * @param {string} val - Raw input (e.g., "MICRO" or "Small manufacturers")
 * @returns {string|null} Canonical segment name (e.g., "Small Manufacturing")
 */
function normalizeSegment(val) {
  if (!val) return null;
  const s = String(val).trim().toUpperCase();
  if (SEGMENT_CODE_MAP[s]) {
    return SEGMENT_CODE_MAP[s];
  }
  for (const canonical of CANONICAL_SEGMENTS) {
    if (canonical.toUpperCase() === s) {
      return canonical;
    }
  }
  return String(val).trim();
}

/**
 * Normalizes a delimiter-separated string or array into an array of canonical names.
 * Example: "micro;prof" -> ["Micro Retail & Services", "Professional Offices"]
 * @param {string|string[]} rawStringOrArray
 * @returns {string[]} Array of canonical segment names
 */
function normalizeSegmentList(rawStringOrArray) {
  if (!rawStringOrArray) return [];
  if (Array.isArray(rawStringOrArray)) {
    return rawStringOrArray.map(normalizeSegment).filter(Boolean);
  }
  return String(rawStringOrArray)
    .split(/[;,|]/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(normalizeSegment);
}

module.exports = {
  SEGMENT_CODE_MAP,
  CANONICAL_SEGMENTS,
  normalizeSegment,
  normalizeSegmentList
};
