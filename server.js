/**
 * ============================================================================
 * AIRTEL BUSINESS CUSTOMER DISCOVERY & RECOMMENDATION ENGINE
 * Main Application Server (server.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * This is the central Express HTTP server that powers both:
 * 1. Phase 1: Customer Discovery Agent (Conversational discovery & schema extraction)
 * 2. Phase 2: Recommendation Engine (Tailored product bundles & what-if analytics)
 * 
 * ARCHITECTURE OVERVIEW:
 * - Frontend: Single-page React application served from /frontend (index.html)
 * - LLM & STT: Sarvam AI API for Indic speech-to-text and multilingual conversations
 * - Database: PostgreSQL in Docker with persistent volumes, backed by an in-memory cache
 * 
 * PRIMARY ROUTES:
 * - POST /chat                  -> Sends customer text message, updates discovery schema
 * - POST /voice                 -> Uploads speech audio, converts via Sarvam STT, runs pipeline
 * - GET  /session/:id           -> Fetches current session schema & conversation history
 * - POST /reset/:id             -> Clears active session for a fresh discovery start
 * - POST /api/recommend         -> Generates 3 tailored Airtel bundles from a customer schema
 * - POST /api/recommend/what-if -> Simulates GSTIN addition or installation timeline adjustments
 * - GET  /health                -> Returns system uptime, Node backend status, and DB state
 * 
 * HOW TO RUN:
 * npm start   (runs: node server.js on port 8000)
 * ============================================================================
 */

// ============================================================================
// 1. IMPORTS & DEPENDENCIES
// ============================================================================
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

// Internal project modules
const config = require('./node-src/config');
const { conversationManager } = require('./node-src/services/conversationManager');
const { sessionStore } = require('./node-src/services/sessionStore');
const { MissingInformationDetector } = require('./node-src/services/detector');
const dbClient = require('./node-src/db/dbClient');
const { runEtl } = require('./node-src/db/preprocessAndLoad');
const { recommendationEngine } = require('./node-src/services/recommendationEngine');
const { targetSegmentService } = require('./node-src/services/targetSegmentService');
const { smartOcrService } = require('./node-src/services/ocrService');
const { orderService } = require('./node-src/services/orderService');
const { secureVault } = require('./node-src/services/secureVault');
const CustomerSchema = require('./node-src/models/customerSchema');
const fs = require('fs');

// ============================================================================
// 2. EXPRESS APP INITIALIZATION & MIDDLEWARE
// ============================================================================
const app = express();

// Multer memory storage handles audio uploads without writing temp files to disk
const upload = multer({ storage: multer.memoryStorage() });

// Enable CORS so the browser frontend can communicate freely with the backend
app.use(cors());

// Parse incoming JSON and form-encoded HTTP request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets (CSS, React JSX, icons)
const frontendDir = path.join(__dirname, 'frontend');
app.use('/static', express.static(frontendDir));

// ============================================================================
// 3. CORE CONVERSATION HANDLERS (PHASE 1: CHAT & VOICE)
// ============================================================================

/**
 * Handles text-based chat messages from the customer.
 * Executes the 11-stage discovery pipeline:
 * Input -> STT Clean -> Language Detect -> Extract JSON -> Diff -> Missing Detect -> Plan Next Question
 */
const handleChat = async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const result = await conversationManager.handleMessage({
      message,
      sessionId: session_id
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in /chat endpoint:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

/**
 * Handles audio recording uploads from the customer microphone.
 * Sends raw audio buffer to Sarvam Speech-to-Text (Saaras:v3),
 * normalizes spoken text, and processes through the conversation manager.
 */
const handleVoice = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Empty audio file uploaded.' });
    }

    const sessionId = req.body.session_id || null;
    const result = await conversationManager.handleMessage({
      message: '',
      sessionId,
      audioBuffer: req.file.buffer,
      filename: req.file.originalname || 'recording.webm',
      mimeType: req.file.mimetype || 'audio/webm'
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in /voice endpoint:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

// Mount Chat & Voice Endpoints (with legacy aliases)
app.post('/chat', handleChat);
app.post('/api/chat', handleChat);

app.post('/voice', upload.single('audio'), handleVoice);
app.post('/api/voice', upload.single('audio'), handleVoice);

// ============================================================================
// 4. SESSION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Retrieves the current customer profile, missing fields, and history for a given session.
 */
const handleGetSession = (req, res) => {
  const sessionId = req.params.session_id;
  const session = sessionStore.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: `Session '${sessionId}' not found.` });
  }

  const detection = MissingInformationDetector.detect(session.schema);
  const compPct = MissingInformationDetector.calculateCompletionPercentage(session.schema);

  return res.json({
    session_id: sessionId,
    customer_schema: session.schema.toJSON(),
    missing_fields: detection.missing_fields,
    ready_for_recommendation: detection.schema_complete,
    completion_percentage: compPct,
    conversation_history: session.conversation_history
  });
};

/**
 * Resets a customer session back to initial empty state.
 */
const handleReset = (req, res) => {
  const sessionId = req.params.session_id;
  sessionStore.reset(sessionId);
  return res.json({
    status: 'reset_successful',
    session_id: sessionId
  });
};

app.get('/session/:session_id', handleGetSession);
app.get('/api/session/:session_id', handleGetSession);

app.post('/reset/:session_id', handleReset);
app.post('/api/reset/:session_id', handleReset);

// ============================================================================
// 5. PHASE 2: RECOMMENDATION ENGINE & WHAT-IF ANALYTICS ENDPOINTS
// ============================================================================

/**
 * POST /api/recommend
 * Generates 3 tailored Airtel bundles (Primary Best Match, Value Saver, Fast-Track)
 * from a customer profile schema.
 */
app.post('/api/recommend', async (req, res) => {
  try {
    const rawSchema = req.body.schema || req.body;
    const schema = new CustomerSchema(rawSchema);
    const recs = await recommendationEngine.generateRecommendations(schema);
    return res.json(recs);
  } catch (err) {
    console.error('Error in /api/recommend:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recommend/:session_id
 * Retrieves recommendations calculated for an ongoing active session.
 */
app.get('/api/recommend/:session_id', async (req, res) => {
  try {
    const session = sessionStore.get(req.params.session_id);
    if (!session) {
      return res.status(404).json({ error: `Session '${req.params.session_id}' not found.` });
    }
    const recs = await recommendationEngine.generateRecommendations(session.schema);
    session.recommendations = recs;
    return res.json(recs);
  } catch (err) {
    console.error('Error in /api/recommend/:session_id:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recommend/what-if
 * Runs interactive what-if simulations:
 * - What products unlock if the customer adjusts their installation timeline?
 * - What enterprise solutions and tax credits unlock if GSTIN is provided?
 */
app.post('/api/recommend/what-if', async (req, res) => {
  try {
    const { session_id, max_installation_days, has_gstin, gstin } = req.body;
    const session = session_id ? sessionStore.get(session_id) : null;
    const baseSchema = session ? session.schema : new CustomerSchema(req.body.schema || {});

    // Create an isolated what-if clone to test parameter modifications
    const testSchema = new CustomerSchema(baseSchema.toJSON());
    if (max_installation_days !== undefined) testSchema.max_installation_days = max_installation_days;
    if (has_gstin !== undefined) testSchema.has_gstin = has_gstin;
    if (gstin !== undefined) testSchema.gstin = gstin;

    const recs = await recommendationEngine.generateRecommendations(testSchema);
    return res.json({
      simulation_params: { max_installation_days, has_gstin, gstin },
      recommendations: recs
    });
  } catch (err) {
    console.error('Error in /api/recommend/what-if:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/segment/resolve
 * Deterministically resolves a business type string into one of the 4 canonical segments:
 * (Micro Retail & Services, Professional Offices, Small Manufacturing, Multi-site Businesses)
 */
app.post('/api/segment/resolve', async (req, res) => {
  try {
    const { business_type } = req.body;
    if (!business_type) {
      return res.status(400).json({ error: 'business_type is required.' });
    }
    const result = await targetSegmentService.resolveSegment(business_type);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/bundles/statistics
 * Returns precomputed historical bundle statistics (popularity, average spend, NPS, churn).
 */
app.get('/api/bundles/statistics', async (req, res) => {
  try {
    const stats = await dbClient.getBundleStatistics();
    return res.json({ count: stats.length, bundle_statistics: stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/products/statistics
 * Returns precomputed product activation and conversion statistics.
 */
app.get('/api/products/statistics', async (req, res) => {
  try {
    const stats = await dbClient.getProductStatistics();
    return res.json({ count: stats.length, product_statistics: stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 6. REGISTRY & DATA CATALOGUE LOOKUP APIS
// ============================================================================

/**
 * GET /api/lookup/gstin/:gstin
 * Looks up a GSTIN in the 3,534+ government registry records.
 */
app.get('/api/lookup/gstin/:gstin', async (req, res) => {
  try {
    const data = await dbClient.findGstin(req.params.gstin);
    if (!data) return res.status(404).json({ error: 'GSTIN not found in registry' });
    return res.json({ found: true, record: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lookup/udyam/:udyam
 * Looks up an MSME Udyam registration number in the 2,723+ registry records.
 */
app.get('/api/lookup/udyam/:udyam', async (req, res) => {
  try {
    const data = await dbClient.findUdyam(req.params.udyam);
    if (!data) return res.status(404).json({ error: 'Udyam registration not found in registry' });
    return res.json({ found: true, record: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/registry/city-tier/:city
 * Looks up telecom network infrastructure tier (Tier 1 or Tier 2) and state for a city.
 */
app.get('/api/registry/city-tier/:city', async (req, res) => {
  try {
    const data = await dbClient.findCityTier(req.params.city);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/registry/cities
 * Returns full catalogue of mapped Indian cities with network infrastructure tiers.
 */
app.get('/api/registry/cities', async (req, res) => {
  try {
    const cities = await dbClient.getAllCityTiers();
    return res.json({ count: cities.length, cities });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


/**
 * GET /api/products
 * Returns all 25 normalized Airtel Business catalogue products.
 */
app.get('/api/products', async (req, res) => {
  try {
    const products = await dbClient.getProducts();
    return res.json({ count: products.length, products });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/database/status
 * Returns connection status of PostgreSQL and in-memory fallback stores.
 */
app.get('/api/database/status', async (req, res) => {
  const pgStatus = await dbClient.testConnection();
  return res.json({
    postgres: pgStatus,
    memory_store: {
      products: dbClient.memoryStore.products.size,
      gstin: dbClient.memoryStore.gstin.size,
      udyam: dbClient.memoryStore.udyam.size,
      leads: dbClient.memoryStore.leads.size,
      city_tiers: dbClient.memoryStore.cityTiers.size
    }
  });
});

/**
 * GET /database
 * Serves the interactive PostgreSQL Database Table Explorer
 */
app.get('/database', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/database.html'));
});

/**
 * GET /api/database/table/:name
 * Returns all records from a specified database table (product_catalogue, city_tier_mapping, etc.)
 */
app.get('/api/database/table/:name', async (req, res) => {
  try {
    const tableName = req.params.name.toLowerCase();
    const validTables = [
      'product_catalogue',
      'city_tier_mapping',
      'gstin_registry',
      'udyam_registry',
      'smb_leads',
      'bundle_statistics',
      'product_statistics',
      'kyc_verifications',
      'customer_orders',
      'quote_rejections'
    ];

    if (!validTables.includes(tableName)) {
      return res.status(400).json({ error: `Invalid table name '${tableName}'. Valid: ${validTables.join(', ')}` });
    }

    // Try PostgreSQL query if connected
    if (dbClient.isConnected) {
      try {
        const queryRes = await dbClient.query(`SELECT * FROM ${tableName} LIMIT 500`);
        if (queryRes && queryRes.rows.length > 0) {
          return res.json({ count: queryRes.rows.length, source: 'PostgreSQL Docker Database', rows: queryRes.rows });
        }
      } catch (_) {}
    }

    // Persistent JSON / Memory Fallback
    if (tableName === 'product_catalogue') {
      const prods = await dbClient.getProducts();
      return res.json({ count: prods.length, source: 'Persistent Normalized Catalogue', rows: prods });
    }
    if (tableName === 'city_tier_mapping') {
      const cities = await dbClient.getAllCityTiers();
      return res.json({ count: cities.length, source: 'Preprocessed City Tiers', rows: cities });
    }
    if (tableName === 'bundle_statistics') {
      const bundles = await dbClient.getBundleStatistics();
      return res.json({ count: bundles.length, source: 'Bundle Statistics Cache', rows: bundles });
    }
    if (tableName === 'product_statistics') {
      const pStats = await dbClient.getProductStatistics();
      return res.json({ count: pStats.length, source: 'Product Statistics Cache', rows: pStats });
    }
    if (tableName === 'gstin_registry') {
      const rows = Array.from(dbClient.memoryStore.gstin.values()).slice(0, 500);
      return res.json({ count: rows.length, source: 'GSTIN Registry Cache (500 preview)', rows });
    }
    if (tableName === 'udyam_registry') {
      const rows = Array.from(dbClient.memoryStore.udyam.values()).slice(0, 500);
      return res.json({ count: rows.length, source: 'Udyam Registry Cache (500 preview)', rows });
    }
    if (tableName === 'smb_leads') {
      const rows = Array.from(dbClient.memoryStore.leads.values()).slice(0, 500);
      return res.json({ count: rows.length, source: 'SMB Leads Cache (500 preview)', rows });
    }
    if (tableName === 'kyc_verifications') {
      const rows = await dbClient.getAllKycRecords();
      return res.json({ count: rows.length, source: 'KYC Verifications Store', rows });
    }
    if (tableName === 'customer_orders') {
      const rows = await dbClient.getAllOrders();
      return res.json({ count: rows.length, source: 'Customer Orders Store', rows });
    }
    if (tableName === 'quote_rejections') {
      const rows = await dbClient.getAllRejections();
      return res.json({ count: rows.length, source: 'Quote Rejections Store', rows });
    }

    return res.json({ count: 0, source: 'Empty', rows: [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 6. PHASE 3 & 4: SMART OCR, KYC VERIFICATION, ORDERS & SALES DASHBOARD
// ============================================================================

/**
 * GET /api/kyc/specimens
 * Lists available sample hackathon documents (K01-K12) for 1-click testing
 */
app.get('/api/kyc/specimens', (req, res) => {
  try {
    const kycDir = path.resolve(__dirname, 'YTL_TrackA_Udyam_Digital_Data/kyc_documents');
    if (!fs.existsSync(kycDir)) {
      return res.json({ specimens: [] });
    }
    const files = fs.readdirSync(kycDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    const categorized = {
      gstin: files.filter(f => f.includes('gst_certificate')),
      udyam: files.filter(f => f.includes('udyam_certificate')),
      signatoryId: files.filter(f => f.includes('signatory_id')),
      addressProof: files.filter(f => f.includes('address_proof'))
    };
    return res.json({ total: files.length, categorized, allFiles: files });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kyc/verify-specimen
 * Instantly triggers OCR and registry verification on a designated specimen document
 */
app.post('/api/kyc/verify-specimen', async (req, res) => {
  try {
    const { filename, docType, sessionId, expectedName } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Specimen filename required.' });
    }
    const filePath = path.resolve(__dirname, 'YTL_TrackA_Udyam_Digital_Data/kyc_documents', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Specimen file '${filename}' not found.` });
    }

    const buffer = fs.readFileSync(filePath);
    let resolvedDocType = docType;
    if (!resolvedDocType) {
      if (filename.includes('gst')) resolvedDocType = 'gstin';
      else if (filename.includes('udyam')) resolvedDocType = 'udyam';
      else if (filename.includes('signatory')) resolvedDocType = 'signatory_id';
      else if (filename.includes('address')) resolvedDocType = 'address_proof';
      else resolvedDocType = 'gstin';
    }

    const result = await smartOcrService.processAndVerifyDocument({
      buffer,
      docType: resolvedDocType,
      sessionId: sessionId || 'test-session-specimen',
      expectedName
    });

    return res.json(result);
  } catch (err) {
    console.error('Error verifying specimen:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kyc/upload
 * Securely uploads, encrypts, and executes OCR verification on user-submitted KYC document
 */
app.post('/api/kyc/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const docType = req.body.doc_type || 'gstin';
    const sessionId = req.body.session_id || 'anonymous-session';
    const userId = req.body.user_id || sessionId;
    const expectedName = req.body.expected_name || null;

    const result = await smartOcrService.processAndVerifyDocument({
      buffer: req.file.buffer,
      docType,
      sessionId,
      userId,
      expectedName
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/kyc/upload:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kyc/session/:session_id
 * Returns all verified/submitted KYC records for a given customer session
 */
app.get('/api/kyc/session/:session_id', async (req, res) => {
  try {
    const records = await dbClient.getKycRecordsBySession(req.params.session_id);
    return res.json({ session_id: req.params.session_id, records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/accept
 * Customer accepts a recommended bundle quote. Checks KYC status and generates contract.
 */
app.post('/api/orders/accept', async (req, res) => {
  try {
    const { sessionId, bundleCode, bundleName, monthlyCost, contractMonths, customerSchema } = req.body;
    if (!sessionId || !bundleCode) {
      return res.status(400).json({ error: 'sessionId and bundleCode are required.' });
    }

    const result = await orderService.acceptQuote({
      sessionId,
      bundleCode,
      bundleName,
      monthlyCost,
      contractMonths,
      customerSchema
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/orders/accept:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/reject
 * Customer declines a bundle quote. Captures rejection reason and customer feedback.
 */
app.post('/api/orders/reject', async (req, res) => {
  try {
    const { sessionId, bundleCode, rejectionReason, customerFeedback, budgetOffered } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }

    const result = await orderService.rejectQuote({
      sessionId,
      bundleCode,
      rejectionReason,
      customerFeedback,
      budgetOffered
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/orders/reject:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/orders/:order_id
 * Retrieves order tracking milestone details for customer and sales views
 */
app.get('/api/orders/:order_id', async (req, res) => {
  try {
    const tracking = await orderService.getOrderTracking(req.params.order_id);
    if (!tracking) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.json(tracking);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/orders/session/:session_id
 * Retrieves orders placed within a customer session
 */
app.get('/api/orders/session/:session_id', async (req, res) => {
  try {
    const orders = await orderService.getOrdersBySession(req.params.session_id);
    return res.json({ session_id: req.params.session_id, orders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sales/dashboard
 * Aggregated dashboard metrics, active escalations, recent orders, and rejection reasons for Sales Agents
 */
app.get('/api/sales/dashboard', async (req, res) => {
  try {
    const data = await orderService.getSalesDashboardData();
    return res.json(data);
  } catch (err) {
    console.error('Error in /api/sales/dashboard:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sales/orders/:order_id/status
 * Sales Agent updates order status, advances installation stage, or logs escalation notes
 */
app.post('/api/sales/orders/:order_id/status', async (req, res) => {
  try {
    const { newStatus, newStage, stageIndex, escalationNote, salesAgent } = req.body;
    const updated = await orderService.updateOrderStatus(req.params.order_id, {
      newStatus,
      newStage,
      stageIndex,
      escalationNote,
      salesAgent: salesAgent || 'Sales Agent'
    });
    return res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Error in /api/sales/orders/:order_id/status:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================

// 7. SYSTEM HEALTH & FRONTEND SERVING
// ============================================================================

/**
 * GET /health
 * Basic health check endpoint for monitoring, load balancers, and test suites.
 */
app.get('/health', (req, res) => {
  return res.json({
    status: 'healthy',
    backend: 'Node.js (Express)',
    service: config.appName,
    database_connected: dbClient.isConnected
  });
});

/**
 * GET /
 * Serves the single-page application React frontend.
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ============================================================================
// 8. SERVER BOOTSTRAP & SEEDING
// ============================================================================

// Asynchronously load and seed data into memory/DB on startup
runEtl().catch((e) => console.warn('Background ETL Notice:', e.message));

// Start the HTTP server listening on the configured port
app.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Airtel Business Discovery Agent (Node.js) running on http://localhost:${config.port}`);
});
