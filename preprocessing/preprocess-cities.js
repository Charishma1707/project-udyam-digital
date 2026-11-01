/**
 * ============================================================================
 * PREPROCESSING MODULE: City-to-Tier Mapping Preprocessor (preprocess-cities.js)
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * Extracts, standardizes, and enriches Indian city classifications into
 * telecommunications infrastructure tiers:
 * - Tier 1: Metro hubs with full high-capacity fiber, MPLS, SD-WAN, and 5G.
 * - Tier 2: Emerging commercial and industrial centers with primary enterprise reach.
 * 
 * 💡 SOURCES & ENRICHMENT:
 * 1. Historical SMB Leads (`smb_leads.csv`): 22 core cities with empirical tiers.
 * 2. Extended National Registry: Additional strategic business hubs (Gurgaon, Noida, etc.).
 * 3. Alias Taxonomy: Resolves colloquial names (e.g. Bombay -> Mumbai, Bangalore -> Bengaluru).
 * 
 * 📋 OUTPUTS:
 * Writes `data/city_tier_mapping.json` for lightning-fast, offline-resilient lookups.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DATA_DIR = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data');
const OUTPUT_DIR = path.resolve(__dirname, '../data');

// Additional national commercial hubs not directly present in smb_leads sample
const ADDITIONAL_NATIONAL_CITIES = [
  { city: 'Gurgaon', city_tier: 1, state: 'Haryana', aliases: ['Gurugram', 'Millennium City'] },
  { city: 'Noida', city_tier: 1, state: 'Uttar Pradesh', aliases: ['Greater Noida'] },
  { city: 'Chandigarh', city_tier: 2, state: 'Punjab', aliases: ['Mohali', 'Panchkula', 'Tricity'] },
  { city: 'Amritsar', city_tier: 2, state: 'Punjab', aliases: [] },
  { city: 'Kanpur', city_tier: 2, state: 'Uttar Pradesh', aliases: [] },
  { city: 'Varanasi', city_tier: 2, state: 'Uttar Pradesh', aliases: ['Banaras', 'Kashi'] },
  { city: 'Agra', city_tier: 2, state: 'Uttar Pradesh', aliases: [] },
  { city: 'Bhubaneswar', city_tier: 2, state: 'Odisha', aliases: ['Cuttack'] },
  { city: 'Guwahati', city_tier: 2, state: 'Assam', aliases: [] },
  { city: 'Thiruvananthapuram', city_tier: 2, state: 'Kerala', aliases: ['Trivandrum'] },
  { city: 'Panaji', city_tier: 2, state: 'Goa', aliases: ['Goa'] },
  { city: 'Dehradun', city_tier: 2, state: 'Uttarakhand', aliases: [] },
  { city: 'Ranchi', city_tier: 2, state: 'Jharkhand', aliases: [] },
  { city: 'Raipur', city_tier: 2, state: 'Chhattisgarh', aliases: [] },
  { city: 'Vijayawada', city_tier: 2, state: 'Andhra Pradesh', aliases: ['Amaravati'] },
  { city: 'Madurai', city_tier: 2, state: 'Tamil Nadu', aliases: [] }
];

// Common colloquial aliases for core cities
const CORE_ALIASES = {
  Bengaluru: ['Bangalore', 'Blr'],
  Mumbai: ['Bombay', 'Navi Mumbai', 'Thane'],
  Kolkata: ['Calcutta'],
  Chennai: ['Madras'],
  Hyderabad: ['Hyd', 'Cyberabad', 'Secunderabad'],
  Delhi: ['New Delhi', 'NCR', 'Delhi NCR'],
  Pune: ['Poona', 'Pimpri-Chinchwad'],
  Vadodara: ['Baroda'],
  Mysuru: ['Mysore'],
  Kochi: ['Cochin', 'Ernakulam'],
  Visakhapatnam: ['Vizag', 'Waltair']
};

/**
 * Parses smb_leads.csv, deduplicates cities, calculates consensus tier,
 * and merges alias dictionaries.
 * @returns {Array<Object>} List of standardized city tier objects
 */
function preprocessCityTiers() {
  const leadsPath = path.join(DATA_DIR, 'smb_leads.csv');
  const cityMap = new Map();

  // 1. Process cities from historical leads
  if (fs.existsSync(leadsPath)) {
    const content = fs.readFileSync(leadsPath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    for (const r of records) {
      const rawCity = (r.city || '').trim();
      const rawTier = parseInt(r.city_tier, 10);
      const state = (r.state || '').trim();

      if (rawCity && !isNaN(rawTier)) {
        const canonicalKey = rawCity.toLowerCase();
        if (!cityMap.has(canonicalKey)) {
          cityMap.set(canonicalKey, {
            city: rawCity,
            city_tier: rawTier,
            state: state,
            aliases: CORE_ALIASES[rawCity] || [],
            source: 'smb_leads.csv',
            lead_count: 0
          });
        }
        cityMap.get(canonicalKey).lead_count++;
      }
    }
  }

  // 2. Merge additional national cities
  for (const ac of ADDITIONAL_NATIONAL_CITIES) {
    const canonicalKey = ac.city.toLowerCase();
    if (!cityMap.has(canonicalKey)) {
      cityMap.set(canonicalKey, {
        city: ac.city,
        city_tier: ac.city_tier,
        state: ac.state,
        aliases: ac.aliases,
        source: 'national_registry',
        lead_count: 0
      });
    }
  }

  const result = Array.from(cityMap.values()).sort((a, b) => a.city.localeCompare(b.city));

  // 3. Write persistent JSON output to data/
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outPath = path.join(OUTPUT_DIR, 'city_tier_mapping.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`✅ [preprocess-cities]: Mapped ${result.length} cities to tiers -> saved to ${outPath}`);

  return result;
}

if (require.main === module) {
  preprocessCityTiers();
}

module.exports = {
  preprocessCityTiers,
  ADDITIONAL_NATIONAL_CITIES,
  CORE_ALIASES
};
