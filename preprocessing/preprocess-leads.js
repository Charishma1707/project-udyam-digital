/**
 * ============================================================================
 * PREPROCESSING MODULE: Historical SMB Leads Preprocessor (preprocess-leads.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Processes 5,000 historical business leads (`smb_leads.csv`) offline to extract:
 * 1. Cleaned historical lead records with standardized segments
 * 2. Deterministic `business_type_mapping` (Learned mappings from business type -> segment)
 * 3. Precomputed `bundle_statistics` (Total sales, average price, NPS, churn rate per bundle)
 * 4. Precomputed `product_statistics` (Activations, conversion rate, NPS per product)
 * 
 * WHY PRECOMPUTE OFFLINE?
 * Precomputing these statistics offline guarantees zero runtime lag during live customer chats!
 * 
 * HOW TO USE:
 * const { preprocessLeads } = require('./preprocess-leads');
 * const { leads, businessTypeMapping, bundleStatistics, productStatistics } = preprocessLeads();
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { normalizeSegment } = require('./normalize-segments');

const DATA_DIR = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data');

// Base canonical domain taxonomy provided in Airtel design specifications
const BASE_DOMAIN_TAXONOMY = {
  "Restaurant": "Micro Retail & Services",
  "Cafe": "Micro Retail & Services",
  "Bakery": "Micro Retail & Services",
  "Grocery": "Micro Retail & Services",
  "Kirana store": "Micro Retail & Services",
  "Medical store": "Micro Retail & Services",
  "Pharmacy": "Micro Retail & Services",
  "Salon": "Micro Retail & Services",
  "Boutique": "Micro Retail & Services",
  "Stationery shop": "Micro Retail & Services",
  "Hardware store": "Micro Retail & Services",
  "Sweet shop": "Micro Retail & Services",
  "Optician": "Micro Retail & Services",
  "Mobile repair shop": "Micro Retail & Services",
  "Law firm": "Professional Offices",
  "Law office": "Professional Offices",
  "Chartered Accountant": "Professional Offices",
  "CA firm": "Professional Offices",
  "Architect": "Professional Offices",
  "Architecture studio": "Professional Offices",
  "Consultant": "Professional Offices",
  "Clinic": "Professional Offices",
  "Dental clinic": "Professional Offices",
  "Diagnostic lab": "Professional Offices",
  "Physiotherapy clinic": "Professional Offices",
  "Coaching centre": "Professional Offices",
  "Real estate agency": "Professional Offices",
  "Travel agency": "Professional Offices",
  "Insurance agency": "Professional Offices",
  "Factory": "Small Manufacturing",
  "Manufacturer": "Small Manufacturing",
  "Textile unit": "Small Manufacturing",
  "Auto-parts unit": "Small Manufacturing",
  "Plastic moulding unit": "Small Manufacturing",
  "Packaging unit": "Small Manufacturing",
  "Food processing unit": "Small Manufacturing",
  "Furniture workshop": "Small Manufacturing",
  "Printing press": "Small Manufacturing",
  "Warehouse": "Multi-site Businesses",
  "Retail chain": "Multi-site Businesses",
  "Hospital chain": "Multi-site Businesses",
  "Restaurant chain": "Multi-site Businesses",
  "Bakery chain": "Multi-site Businesses",
  "Pharmacy chain": "Multi-site Businesses",
  "Apparel retail chain": "Multi-site Businesses",
  "Electronics retail chain": "Multi-site Businesses",
  "Pre-school chain": "Multi-site Businesses",
  "Budget hotel group": "Multi-site Businesses",
  "Gym chain": "Multi-site Businesses"
};

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

function cleanDate(val) {
  const s = cleanStr(val);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// ============================================================================
// MAIN PREPROCESSING FUNCTION
// ============================================================================

/**
 * Preprocesses smb_leads.csv into cleaned leads and aggregated statistics.
 * @param {string} [filePath]
 * @returns {Object} { leads, businessTypeMapping, bundleStatistics, productStatistics }
 */
function preprocessLeads(filePath = path.join(DATA_DIR, 'smb_leads.csv')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`SMB Leads CSV not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleanedLeads = [];
  const businessTypeCounts = {}; // { [bType]: { [segment]: count } }
  const bundleMap = {};          // { [bundle_products]: { count, total_value, total_setup, nps_sum, nps_count, churn_count } }
  const productStatsMap = {};    // { [pid]: { recommended_count, activated_count, nps_sum, nps_count, churn_count } }

  for (const r of records) {
    const bType = cleanStr(r.business_type);
    const seg = normalizeSegment(cleanStr(r.segment));
    const isActivated = cleanStr(r.outcome) === 'Activated';
    const isChurned = cleanBool(r.churned_within_6_months);
    const nps = cleanInt(r.nps_score);
    const bundle = cleanStr(r.bundle_products);
    const monthlyVal = cleanFloat(r.monthly_bundle_value_inr);
    const setupVal = cleanFloat(r.one_time_setup_inr);
    const productsOfInterest = cleanStr(r.products_of_interest)
      ? cleanStr(r.products_of_interest).split(';').map(x => x.trim()).filter(Boolean)
      : [];

    const lead = {
      lead_id: cleanStr(r.lead_id),
      created_date: cleanDate(r.created_date),
      lead_source: cleanStr(r.lead_source),
      business_name: cleanStr(r.business_name),
      business_type: bType,
      segment: seg,
      city: cleanStr(r.city),
      city_tier: cleanInt(r.city_tier),
      num_sites: cleanInt(r.num_sites) || 1,
      employee_count: cleanInt(r.employee_count) || 1,
      annual_turnover_band: cleanStr(r.annual_turnover_band),
      current_telecom_provider: cleanStr(r.current_telecom_provider),
      monthly_telecom_spend_inr: cleanFloat(r.monthly_telecom_spend_inr),
      primary_need: cleanStr(r.primary_need),
      products_of_interest: productsOfInterest,
      budget_band: cleanStr(r.budget_band),
      decision_maker_role: cleanStr(r.decision_maker_role),
      preferred_contact_channel: cleanStr(r.preferred_contact_channel),
      preferred_language: cleanStr(r.preferred_language),
      outcome: cleanStr(r.outcome),
      drop_off_stage: cleanStr(r.drop_off_stage),
      drop_off_reason: cleanStr(r.drop_off_reason),
      bundle_products: bundle,
      monthly_bundle_value_inr: monthlyVal,
      one_time_setup_inr: setupVal,
      contract_months: cleanInt(r.contract_months),
      churned_within_6_months: isChurned,
      nps_score: nps,
      tat_days: cleanInt(r.tat_days)
    };

    cleanedLeads.push(lead);

    // Track Business Type -> Segment occurrence
    if (bType && seg) {
      if (!businessTypeCounts[bType]) businessTypeCounts[bType] = {};
      businessTypeCounts[bType][seg] = (businessTypeCounts[bType][seg] || 0) + 1;
    }

    // Track Products of Interest (Recommendations)
    for (const pid of productsOfInterest) {
      if (!productStatsMap[pid]) {
        productStatsMap[pid] = { recommended_count: 0, activated_count: 0, nps_sum: 0, nps_count: 0, churn_count: 0 };
      }
      productStatsMap[pid].recommended_count++;
    }

    // Track Bundles and Outcomes
    if (bundle && isActivated) {
      if (!bundleMap[bundle]) {
        bundleMap[bundle] = {
          bundle_code: bundle,
          total_sold: 0,
          value_sum: 0,
          setup_sum: 0,
          nps_sum: 0,
          nps_count: 0,
          churn_count: 0,
          segments: {}
        };
      }
      const bObj = bundleMap[bundle];
      bObj.total_sold++;
      if (monthlyVal) bObj.value_sum += monthlyVal;
      if (setupVal) bObj.setup_sum += setupVal;
      if (nps !== null) {
        bObj.nps_sum += nps;
        bObj.nps_count++;
      }
      if (isChurned) bObj.churn_count++;
      if (seg) bObj.segments[seg] = (bObj.segments[seg] || 0) + 1;

      // Extract individual product items e.g., P01x1;P07x2
      const items = bundle.split(';').map(x => x.trim()).filter(Boolean);
      for (const item of items) {
        const [pid] = item.split('x');
        if (pid) {
          if (!productStatsMap[pid]) {
            productStatsMap[pid] = { recommended_count: 0, activated_count: 0, nps_sum: 0, nps_count: 0, churn_count: 0 };
          }
          productStatsMap[pid].activated_count++;
          if (nps !== null) {
            productStatsMap[pid].nps_sum += nps;
            productStatsMap[pid].nps_count++;
          }
          if (isChurned) productStatsMap[pid].churn_count++;
        }
      }
    }
  }

  // Derive Deterministic Business Type -> Segment Mapping (Highest occurrence in historical data)
  const businessTypeMapping = { ...BASE_DOMAIN_TAXONOMY };
  for (const [bType, segCounts] of Object.entries(businessTypeCounts)) {
    let topSeg = null;
    let maxCount = -1;
    for (const [s, count] of Object.entries(segCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topSeg = s;
      }
    }
    businessTypeMapping[bType] = topSeg;
  }

  // Precompute Bundle Statistics
  const bundleStatistics = Object.values(bundleMap).map(b => ({
    bundle_code: b.bundle_code,
    total_sold: b.total_sold,
    avg_monthly_value: b.total_sold > 0 ? Math.round(b.value_sum / b.total_sold) : 0,
    avg_setup_fee: b.total_sold > 0 ? Math.round(b.setup_sum / b.total_sold) : 0,
    avg_nps: b.nps_count > 0 ? parseFloat((b.nps_sum / b.nps_count).toFixed(2)) : null,
    churn_rate: b.total_sold > 0 ? parseFloat((b.churn_count / b.total_sold).toFixed(3)) : 0,
    top_segment: Object.entries(b.segments).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Micro Retail & Services'
  })).sort((a, b) => b.total_sold - a.total_sold);

  // Precompute Product Statistics
  const productStatistics = Object.entries(productStatsMap).map(([pid, st]) => ({
    product_id: pid,
    times_recommended: st.recommended_count,
    times_activated: st.activated_count,
    conversion_rate: st.recommended_count > 0 ? parseFloat((st.activated_count / st.recommended_count).toFixed(3)) : 1.0,
    avg_nps: st.nps_count > 0 ? parseFloat((st.nps_sum / st.nps_count).toFixed(2)) : 8.5,
    churn_rate: st.activated_count > 0 ? parseFloat((st.churn_count / st.activated_count).toFixed(3)) : 0.05
  })).sort((a, b) => b.times_activated - a.times_activated);

  return {
    leads: cleanedLeads,
    businessTypeMapping,
    bundleStatistics,
    productStatistics
  };
}

module.exports = {
  preprocessLeads
};
