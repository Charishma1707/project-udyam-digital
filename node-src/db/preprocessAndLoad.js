/**
 * ============================================================================
 * AIRTEL BUSINESS AI AGENT - ETL DATA LOADER & NORMALIZER
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * This module is responsible for loading, sanitizing, and caching all business
 * data from the raw CSV datasets:
 * 1. `product_catalogue.csv` -> 20 Airtel Business telecommunications products.
 * 2. `mock_gstin_registry.csv` -> GSTIN registration identities for businesses.
 * 3. `mock_udyam_registry.csv` -> Udyam MSME certificate registrations.
 * 4. `smb_leads.csv` -> 5,000 real-world SMB leads with historical conversions.
 * 
 * 🔄 DUAL-MODE EXECUTION:
 * - Can be run as a standalone CLI script: `node node-src/db/preprocessAndLoad.js`
 * - Can be required as a module to pre-populate in-memory `memoryStore` at runtime.
 * - If PostgreSQL is online, it creates or upserts records into Docker tables.
 * - In all cases, it writes verified JSON to the `data/` directory.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { getPool, testConnection, memoryStore } = require('./dbClient');

const DATA_DIR = path.resolve(__dirname, '../../YTL_TrackA_Udyam_Digital_Data');
const OUTPUT_CACHE_DIR = path.resolve(__dirname, '../../data');

// --------------------------------------------------------------------------
// SECTION 1: Type Sanitization Utilities
// --------------------------------------------------------------------------
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
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

const { preprocessProducts } = require('../../preprocessing/preprocess-products');
const { preprocessCityTiers } = require('../../preprocessing/preprocess-cities');

async function loadProductCatalogue() {
  const cleaned = preprocessProducts();
  cleaned.forEach((p) => memoryStore.products.set(p.product_id, p));
  return cleaned;
}

async function loadCityTiers() {
  const cleaned = preprocessCityTiers();
  cleaned.forEach((c) => memoryStore.cityTiers.set(c.city.toLowerCase(), c));
  return cleaned;
}


async function loadGstinRegistry() {
  const filePath = path.join(DATA_DIR, 'mock_gstin_registry.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleaned = records.map((r) => ({
    gstin: cleanStr(r.gstin),
    legal_name: cleanStr(r.legal_name),
    trade_name: cleanStr(r.trade_name),
    constitution: cleanStr(r.constitution),
    principal_place_of_business: cleanStr(r.principal_place_of_business),
    state: cleanStr(r.state),
    registration_date: cleanDate(r.registration_date),
    status: cleanStr(r.status)
  }));

  cleaned.forEach((g) => {
    if (g.gstin) memoryStore.gstin.set(g.gstin.toUpperCase(), g);
  });
  return cleaned;
}

async function loadUdyamRegistry() {
  const filePath = path.join(DATA_DIR, 'mock_udyam_registry.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleaned = records.map((r) => ({
    udyam_number: cleanStr(r.udyam_number),
    enterprise_name: cleanStr(r.enterprise_name),
    enterprise_type: cleanStr(r.enterprise_type),
    major_activity: cleanStr(r.major_activity),
    nic_description: cleanStr(r.nic_description),
    state: cleanStr(r.state),
    city: cleanStr(r.city),
    date_of_registration: cleanDate(r.date_of_registration)
  }));

  cleaned.forEach((u) => {
    if (u.udyam_number) memoryStore.udyam.set(u.udyam_number.toUpperCase(), u);
  });
  return cleaned;
}

async function loadSmbLeads() {
  const filePath = path.join(DATA_DIR, 'smb_leads.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  const cleaned = records.map((r) => ({
    lead_id: cleanStr(r.lead_id),
    created_date: cleanDate(r.created_date),
    lead_source: cleanStr(r.lead_source),
    business_name: cleanStr(r.business_name),
    business_type: cleanStr(r.business_type),
    segment: cleanStr(r.segment),
    city: cleanStr(r.city),
    city_tier: cleanInt(r.city_tier),
    state: cleanStr(r.state),
    preferred_language: cleanStr(r.preferred_language),
    employee_count: cleanInt(r.employee_count),
    num_sites: cleanInt(r.num_sites),
    annual_turnover_band: cleanStr(r.annual_turnover_band),
    has_gstin: cleanBool(r.has_gstin),
    gstin: cleanStr(r.gstin),
    has_udyam: cleanBool(r.has_udyam),
    udyam_number: cleanStr(r.udyam_number),
    current_internet: cleanStr(r.current_internet),
    current_provider: cleanStr(r.current_provider),
    monthly_telecom_spend_inr: cleanFloat(r.monthly_telecom_spend_inr),
    products_of_interest: cleanStr(r.products_of_interest),
    contact_name: cleanStr(r.contact_name),
    contact_role: cleanStr(r.contact_role),
    stage_reached: cleanStr(r.stage_reached),
    outcome: cleanStr(r.outcome),
    drop_reason: cleanStr(r.drop_reason),
    contacted_date: cleanDate(r.contacted_date),
    needs_assessed_date: cleanDate(r.needs_assessed_date),
    quote_accepted_date: cleanDate(r.quote_accepted_date),
    kyc_complete_date: cleanDate(r.kyc_complete_date),
    activated_date: cleanDate(r.activated_date),
    days_lead_to_activation: cleanInt(r.days_lead_to_activation),
    customer_follow_up_calls: cleanInt(r.customer_follow_up_calls) || 0,
    bundle_products: cleanStr(r.bundle_products),
    monthly_bundle_value_inr: cleanFloat(r.monthly_bundle_value_inr),
    one_time_setup_inr: cleanFloat(r.one_time_setup_inr),
    contract_months: cleanInt(r.contract_months),
    churned_within_6_months: cleanBool(r.churned_within_6_months),
    nps_score: cleanInt(r.nps_score),
    acquisition_cost_inr: cleanFloat(r.acquisition_cost_inr)
  }));

  cleaned.forEach((l) => {
    if (l.lead_id) memoryStore.leads.set(l.lead_id.toUpperCase(), l);
  });
  return cleaned;
}

async function insertIntoPostgres(products, gstins, udyams, leads, cityTiers = []) {
  const conn = await testConnection();
  if (!conn.ok) {
    console.log('ℹ️ [PostgreSQL]: Database offline or unreachable. Seeded into persistent in-memory store.');
    return false;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Products
    for (const p of products) {
      await client.query(
        `INSERT INTO product_catalogue (
          product_id, category, product_name, description, unit, price_min_inr_per_month,
          price_max_inr_per_month, one_time_setup_inr, min_contract_months, available_city_tiers,
          min_employees, min_sites, requires_gstin, requires_one_of, typical_install_days, target_segments
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (product_id) DO UPDATE SET
          price_min_inr_per_month = EXCLUDED.price_min_inr_per_month,
          price_max_inr_per_month = EXCLUDED.price_max_inr_per_month`,
        [
          p.product_id, p.category, p.product_name, p.description, p.unit, p.price_min_inr_per_month,
          p.price_max_inr_per_month, p.one_time_setup_inr, p.min_contract_months, p.available_city_tiers,
          p.min_employees, p.min_sites, p.requires_gstin, p.requires_one_of, p.typical_install_days, p.target_segments
        ]
      );
    }
    console.log(`✅ [PostgreSQL]: Inserted/Updated ${products.length} products into product_catalogue`);

    // 2. GSTIN Registry
    for (const g of gstins) {
      await client.query(
        `INSERT INTO gstin_registry (
          gstin, legal_name, trade_name, constitution, principal_place_of_business, state, registration_date, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (gstin) DO UPDATE SET status = EXCLUDED.status`,
        [g.gstin, g.legal_name, g.trade_name, g.constitution, g.principal_place_of_business, g.state, g.registration_date, g.status]
      );
    }
    console.log(`✅ [PostgreSQL]: Inserted/Updated ${gstins.length} records into gstin_registry`);

    // 3. Udyam Registry
    for (const u of udyams) {
      await client.query(
        `INSERT INTO udyam_registry (
          udyam_number, enterprise_name, enterprise_type, major_activity, nic_description, state, city, date_of_registration
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (udyam_number) DO UPDATE SET enterprise_name = EXCLUDED.enterprise_name`,
        [u.udyam_number, u.enterprise_name, u.enterprise_type, u.major_activity, u.nic_description, u.state, u.city, u.date_of_registration]
      );
    }
    console.log(`✅ [PostgreSQL]: Inserted/Updated ${udyams.length} records into udyam_registry`);

    // 4. City-to-Tier Mapping
    if (cityTiers && cityTiers.length > 0) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS city_tier_mapping (
          city VARCHAR(100) PRIMARY KEY,
          city_tier INTEGER NOT NULL,
          state VARCHAR(100),
          aliases TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      for (const c of cityTiers) {
        const aliasStr = Array.isArray(c.aliases) ? c.aliases.join(';') : (c.aliases || '');
        await client.query(
          `INSERT INTO city_tier_mapping (city, city_tier, state, aliases)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (city) DO UPDATE SET
             city_tier = EXCLUDED.city_tier,
             state = EXCLUDED.state,
             aliases = EXCLUDED.aliases`,
          [c.city, c.city_tier, c.state, aliasStr]
        );
      }
      console.log(`✅ [PostgreSQL]: Inserted/Updated ${cityTiers.length} records into city_tier_mapping`);
    }

    // 5. SMB Leads (Batch insert)
    const BATCH_SIZE = 500;
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      for (const l of batch) {
        await client.query(
          `INSERT INTO smb_leads (
            lead_id, created_date, lead_source, business_name, business_type, segment, city, city_tier,
            state, preferred_language, employee_count, num_sites, annual_turnover_band, has_gstin,
            gstin, has_udyam, udyam_number, current_internet, current_provider, monthly_telecom_spend_inr,
            products_of_interest, contact_name, contact_role, stage_reached, outcome, drop_reason,
            contacted_date, needs_assessed_date, quote_accepted_date, kyc_complete_date, activated_date,
            days_lead_to_activation, customer_follow_up_calls, bundle_products, monthly_bundle_value_inr,
            one_time_setup_inr, contract_months, churned_within_6_months, nps_score, acquisition_cost_inr
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40
          )
          ON CONFLICT (lead_id) DO UPDATE SET outcome = EXCLUDED.outcome`,
          [
            l.lead_id, l.created_date, l.lead_source, l.business_name, l.business_type, l.segment, l.city, l.city_tier,
            l.state, l.preferred_language, l.employee_count, l.num_sites, l.annual_turnover_band, l.has_gstin,
            l.gstin, l.has_udyam, l.udyam_number, l.current_internet, l.current_provider, l.monthly_telecom_spend_inr,
            l.products_of_interest, l.contact_name, l.contact_role, l.stage_reached, l.outcome, l.drop_reason,
            l.contacted_date, l.needs_assessed_date, l.quote_accepted_date, l.kyc_complete_date, l.activated_date,
            l.days_lead_to_activation, l.customer_follow_up_calls, l.bundle_products, l.monthly_bundle_value_inr,
            l.one_time_setup_inr, l.contract_months, l.churned_within_6_months, l.nps_score, l.acquisition_cost_inr
          ]
        );
      }
    }
    console.log(`✅ [PostgreSQL]: Inserted/Updated ${leads.length} records into smb_leads`);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [PostgreSQL Error]: Failed to insert dataset:', err.message);
    return false;
  } finally {
    client.release();
  }
}

async function runEtl() {
  console.log('🔄 Starting Preprocessing & Database ETL Pipeline...');
  const startTime = Date.now();

  const products = await loadProductCatalogue();
  const gstins = await loadGstinRegistry();
  const udyams = await loadUdyamRegistry();
  const leads = await loadSmbLeads();
  const cityTiers = await loadCityTiers();

  // Save persistent preprocessed JSON cache in data/
  if (!fs.existsSync(OUTPUT_CACHE_DIR)) {
    fs.mkdirSync(OUTPUT_CACHE_DIR, { recursive: true });
  }

  const cacheSummary = {
    generated_at: new Date().toISOString(),
    metrics: {
      products: products.length,
      gstin_registry: gstins.length,
      udyam_registry: udyams.length,
      smb_leads: leads.length,
      city_tier_mapping: cityTiers.length,
      total_records: products.length + gstins.length + udyams.length + leads.length + cityTiers.length
    }
  };

  fs.writeFileSync(
    path.join(OUTPUT_CACHE_DIR, 'summary.json'),
    JSON.stringify(cacheSummary, null, 2),
    'utf-8'
  );

  // Try PostgreSQL insertion if running
  await insertIntoPostgres(products, gstins, udyams, leads, cityTiers);

  const durationMs = Date.now() - startTime;
  console.log(`✨ ETL Completed successfully in ${durationMs}ms:`);
  console.log(`   - Product Catalogue:  ${products.length} records`);
  console.log(`   - GSTIN Registry:     ${gstins.length} records`);
  console.log(`   - Udyam Registry:     ${udyams.length} records`);
  console.log(`   - City Tier Mappings: ${cityTiers.length} records`);
  console.log(`   - SMB Leads:          ${leads.length} records`);
  console.log(`   - Total Processed:    ${cacheSummary.metrics.total_records} records`);

  return cacheSummary;
}

if (require.main === module) {
  runEtl()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal ETL error:', err);
      process.exit(1);
    });
}

module.exports = {
  runEtl,
  loadProductCatalogue,
  loadGstinRegistry,
  loadUdyamRegistry,
  loadCityTiers,
  loadSmbLeads
};

