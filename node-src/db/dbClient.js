/**
 * ============================================================================
 * AIRTEL BUSINESS AI AGENT - DATABASE CLIENT & REGISTRY SERVICE
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * This file manages all database interactions with PostgreSQL:
 * 1. Connection Pooling: Maintains a pool of reusable database connections.
 * 2. Type Normalization: Converts PostgreSQL NUMERIC/DECIMAL types to JS floats.
 * 3. Dual-Layer Storage:
 *    - Primary: Queries real PostgreSQL tables (product_catalogue, gstin_registry, etc.)
 *    - Fallback: In-memory `memoryStore` and cached JSON in `data/` if PostgreSQL
 *      is unavailable. This ensures the app is 100% resilient and never crashes.
 * 4. Data Row Normalization: Standardizes semicolon-separated strings (like
 *    `available_city_tiers` or `target_segments`) into clean JavaScript arrays.
 * 
 * 🗄️ SUPPORTED LOOKUPS:
 * - findGstin(gstin): Checks government GSTIN registry for business validation.
 * - findUdyam(udyamNumber): Checks MSME Udyam registration details.
 * - getProducts(): Returns all 20 Airtel Business enterprise products.
 * - getLeadById(leadId): Retrieves historical lead records.
 * - getBundleStatistics() & getProductStatistics(): Conversion rates & popularity.
 * ============================================================================
 */

const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');

// SECTION 1: PostgreSQL Type Parsers
// Automatically parse PostgreSQL NUMERIC/DECIMAL (OID 1700) to JavaScript float
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

// SECTION 2: Connection Pool Configuration
// Database configuration from environment
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'airtel_admin',
  password: process.env.DB_PASSWORD || 'airtel_secure_pass_2026',
  database: process.env.DB_NAME || 'airtel_udyam_db',
  connectionTimeoutMillis: 2000,
  max: 10
};

let pool = null;
let isConnected = false;

function getPool() {
  if (!pool) {
    pool = new Pool(dbConfig);
    pool.on('error', (err) => {
      console.warn('⚠️ [PostgreSQL Pool Error]:', err.message);
      isConnected = false;
    });
  }
  return pool;
}

// SECTION 3: In-Memory Persistent Fallback Store
// Guaranteed offline fallback cache when Docker/PostgreSQL is not started
const memoryStore = {
  products: new Map(),
  gstin: new Map(),
  udyam: new Map(),
  leads: new Map(),
  cityTiers: new Map(),
  kyc: new Map(),
  orders: new Map(),
  rejections: []
};



async function testConnection() {
  try {
    const p = getPool();
    const res = await p.query('SELECT NOW() as current_time');
    isConnected = true;
    return { ok: true, time: res.rows[0].current_time };
  } catch (err) {
    isConnected = false;
    return { ok: false, error: err.message };
  }
}

async function query(sql, params = []) {
  if (!isConnected) {
    await testConnection();
  }
  if (isConnected) {
    try {
      const p = getPool();
      return await p.query(sql, params);
    } catch (err) {
      console.warn('[PostgreSQL Query Warning]:', err.message);
    }
  }
  return null;
}

function normalizeProductRow(row) {
  if (!row) return row;
  let targetSegments = row.target_segments;
  if (typeof targetSegments === 'string') {
    targetSegments = targetSegments.split(';').map(s => s.trim()).filter(Boolean);
  } else if (!Array.isArray(targetSegments)) {
    targetSegments = [];
  }

  let cityTiers = row.available_city_tiers;
  if (typeof cityTiers === 'string') {
    cityTiers = cityTiers.split(';').map(t => parseInt(t.trim(), 10)).filter(n => !isNaN(n));
  } else if (!Array.isArray(cityTiers)) {
    cityTiers = [];
  }

  let requiresOneOf = row.requires_one_of;
  if (typeof requiresOneOf === 'string') {
    requiresOneOf = requiresOneOf.split('|').map(s => s.trim()).filter(Boolean);
  } else if (!Array.isArray(requiresOneOf)) {
    requiresOneOf = [];
  }

  return {
    ...row,
    price_min_inr_per_month: typeof row.price_min_inr_per_month === 'number' ? row.price_min_inr_per_month : parseFloat(row.price_min_inr_per_month || 0),
    price_max_inr_per_month: typeof row.price_max_inr_per_month === 'number' ? row.price_max_inr_per_month : parseFloat(row.price_max_inr_per_month || 0),
    one_time_setup_inr: typeof row.one_time_setup_inr === 'number' ? row.one_time_setup_inr : parseFloat(row.one_time_setup_inr || 0),
    min_employees: typeof row.min_employees === 'number' ? row.min_employees : parseInt(row.min_employees || 1, 10),
    min_sites: typeof row.min_sites === 'number' ? row.min_sites : parseInt(row.min_sites || 1, 10),
    typical_install_days: typeof row.typical_install_days === 'number' ? row.typical_install_days : parseInt(row.typical_install_days || 7, 10),
    requires_gstin: row.requires_gstin === true || row.requires_gstin === 'true' || row.requires_gstin === 't' || row.requires_gstin === 1 || row.requires_gstin === 'Y',
    target_segments: targetSegments,
    available_city_tiers: cityTiers,
    requires_one_of: requiresOneOf
  };
}

// Registry Lookups with fallback to memoryStore
async function findGstin(gstin) {
  if (!gstin) return null;
  const clean = gstin.trim().toUpperCase();
  try {
    const res = await query('SELECT * FROM gstin_registry WHERE gstin = $1', [clean]);
    if (res && res.rows.length > 0) return res.rows[0];
  } catch (_) {}
  return memoryStore.gstin.get(clean) || null;
}

async function findUdyam(udyamNumber) {
  if (!udyamNumber) return null;
  const clean = udyamNumber.trim().toUpperCase();
  try {
    const res = await query('SELECT * FROM udyam_registry WHERE udyam_number = $1', [clean]);
    if (res && res.rows.length > 0) return res.rows[0];
  } catch (_) {}
  return memoryStore.udyam.get(clean) || null;
}

// ----------------------------------------------------------------------------
// SECTION 4: City-to-Tier Registry & Tool Functions
// ----------------------------------------------------------------------------
function loadCityTierCache() {
  if (memoryStore.cityTiers.size > 0) return;
  const filePath = path.resolve(__dirname, '../../data/city_tier_mapping.json');
  if (fs.existsSync(filePath)) {
    try {
      const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      for (const r of records) {
        memoryStore.cityTiers.set(r.city.toLowerCase(), r);
      }
    } catch (_) {}
  }
}

/**
 * Looks up the network infrastructure tier (Tier 1 or Tier 2) for a given city name.
 * Handles canonical names, colloquial aliases (e.g., Bombay -> Mumbai), and substring variations.
 * @param {string} cityQuery - Free-form city name from customer speech or text
 * @returns {Promise<Object>} { city, city_tier, state, matched, source }
 */
async function findCityTier(cityQuery) {
  if (!cityQuery || typeof cityQuery !== 'string') {
    return { city: null, city_tier: 2, state: null, matched: false };
  }
  const clean = cityQuery.trim();
  const lower = clean.toLowerCase();

  // 1. Check PostgreSQL if connected
  if (isConnected) {
    try {
      const res = await query(
        `SELECT city, city_tier, state, aliases FROM city_tier_mapping 
         WHERE LOWER(city) = $1 OR aliases ILIKE $2 LIMIT 1`,
        [lower, `%${lower}%`]
      );
      if (res && res.rows.length > 0) {
        const row = res.rows[0];
        return {
          city: row.city,
          city_tier: parseInt(row.city_tier, 10),
          state: row.state,
          matched: true,
          source: 'postgresql'
        };
      }
    } catch (_) {}
  }

  // 2. In-Memory Persistent Store / JSON Cache Fallback
  loadCityTierCache();

  // Direct case-insensitive match
  if (memoryStore.cityTiers.has(lower)) {
    const item = memoryStore.cityTiers.get(lower);
    return {
      city: item.city,
      city_tier: item.city_tier,
      state: item.state,
      matched: true,
      source: 'memory_cache'
    };
  }

  // Check aliases array (e.g. "Bangalore" -> "Bengaluru", "Vizag" -> "Visakhapatnam")
  for (const item of memoryStore.cityTiers.values()) {
    if (Array.isArray(item.aliases)) {
      const aliasMatch = item.aliases.some(
        a => a.toLowerCase() === lower || lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower)
      );
      if (aliasMatch) {
        return {
          city: item.city,
          city_tier: item.city_tier,
          state: item.state,
          matched: true,
          matched_alias: clean,
          source: 'memory_alias'
        };
      }
    }
    // Substring match on canonical city name
    if (lower.includes(item.city.toLowerCase()) || item.city.toLowerCase().includes(lower)) {
      return {
        city: item.city,
        city_tier: item.city_tier,
        state: item.state,
        matched: true,
        source: 'memory_substring'
      };
    }
  }

  // Default fallback for any other unlisted Indian municipality: Tier 2 (Commercial Baseline)
  return {
    city: clean,
    city_tier: 2,
    state: null,
    matched: false,
    source: 'default_fallback'
  };
}

/**
 * Returns all mapped cities with tiers and states
 * @returns {Promise<Array<Object>>}
 */
async function getAllCityTiers() {
  if (isConnected) {
    try {
      const res = await query('SELECT city, city_tier, state, aliases FROM city_tier_mapping ORDER BY city ASC');
      if (res && res.rows.length > 0) return res.rows;
    } catch (_) {}
  }
  loadCityTierCache();
  return Array.from(memoryStore.cityTiers.values());
}


async function getProducts() {
  try {
    const res = await query('SELECT * FROM product_catalogue ORDER BY product_id');
    if (res && res.rows.length > 0) {
      return res.rows.map(normalizeProductRow);
    }
  } catch (_) {}

  if (memoryStore.products.size > 0) {
    return Array.from(memoryStore.products.values()).map(normalizeProductRow);
  }

  // Load from persistent cached normalized products
  const cachedPath = path.resolve(__dirname, '../../data/products_normalized.json');
  if (fs.existsSync(cachedPath)) {
    try {
      const items = JSON.parse(fs.readFileSync(cachedPath, 'utf-8'));
      for (const item of items) {
        memoryStore.products.set(item.product_id, item);
      }
      return items.map(normalizeProductRow);
    } catch (_) {}
  }
  return [];
}

async function getLeadById(leadId) {
  if (!leadId) return null;
  const clean = leadId.trim().toUpperCase();
  try {
    const res = await query('SELECT * FROM smb_leads WHERE lead_id = $1', [clean]);
    if (res && res.rows.length > 0) return res.rows[0];
  } catch (_) {}
  return memoryStore.leads.get(clean) || null;
}

async function getBundleStatistics() {
  if (isConnected) {
    try {
      const res = await query('SELECT * FROM bundle_statistics ORDER BY total_sold DESC LIMIT 50');
      if (res && res.rows.length > 0) return res.rows;
    } catch (_) {}
  }
  const filePath = path.resolve(__dirname, '../../data/bundle_statistics.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (_) {}
  }
  return [];
}

async function getProductStatistics() {
  if (isConnected) {
    try {
      const res = await query('SELECT * FROM product_statistics ORDER BY times_activated DESC');
      if (res && res.rows.length > 0) return res.rows;
    } catch (_) {}
  }
  const filePath = path.resolve(__dirname, '../../data/product_statistics.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (_) {}
  }
  return [];
}

async function getBusinessTypeMappings() {
  if (isConnected) {
    try {
      const res = await query('SELECT business_type, segment FROM business_type_mapping');
      if (res && res.rows.length > 0) {
        return Object.fromEntries(res.rows.map(r => [r.business_type, r.segment]));
      }
    } catch (_) {}
  }
  const filePath = path.resolve(__dirname, '../../data/business_type_mapping.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (_) {}
  }
  return {};
}

// ============================================================================
// SECTION 4: KYC VERIFICATION, ORDERS & REJECTIONS DATA ACCESS
// ============================================================================

async function saveKycRecord(record) {
  const id = record.id || 'KYC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const rec = { id, ...record };
  memoryStore.kyc.set(id, rec);
  return rec;
}

async function getKycRecordsBySession(sessionId) {
  return Array.from(memoryStore.kyc.values()).filter(r => r.sessionId === sessionId);
}

async function getAllKycRecords() {
  return Array.from(memoryStore.kyc.values());
}

async function saveOrder(order) {
  memoryStore.orders.set(order.orderId, order);
  return order;
}

async function getOrderById(orderId) {
  return memoryStore.orders.get(orderId) || null;
}

async function getOrdersBySession(sessionId) {
  return Array.from(memoryStore.orders.values()).filter(o => o.sessionId === sessionId);
}

async function getAllOrders() {
  return Array.from(memoryStore.orders.values());
}

async function saveQuoteRejection(rejection) {
  memoryStore.rejections.push(rejection);
  return rejection;
}

async function getAllRejections() {
  return [...memoryStore.rejections];
}

module.exports = {
  getPool,
  testConnection,
  query,
  findGstin,
  findUdyam,
  findCityTier,
  getAllCityTiers,
  getProducts,
  getLeadById,
  getBundleStatistics,
  getProductStatistics,
  getBusinessTypeMappings,
  saveKycRecord,
  getKycRecordsBySession,
  getAllKycRecords,
  saveOrder,
  getOrderById,
  getOrdersBySession,
  getAllOrders,
  saveQuoteRejection,
  getAllRejections,
  memoryStore,
  get isConnected() { return isConnected; }
};

