/**
 * ============================================================================
 * AIRTEL BUSINESS CUSTOMER DISCOVERY & RECOMMENDATION ENGINE
 * Main TypeScript Server Entrypoint (server.ts)
 * ============================================================================
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configuration and domain services
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
const CustomerSchema = require('./node-src/models/customerSchema');

import type {
  ICustomerSchema,
  IConversationResult,
  IRecommendationResponse,
  IKycVerificationResult,
  IOrder
} from './node-src/types';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets
const frontendDir = path.join(__dirname, 'frontend');
app.use('/static', express.static(frontendDir));

// ============================================================================
// CORE CONVERSATION HANDLERS (PHASE 1: CHAT & VOICE)
// ============================================================================

const handleChat = async (req: Request, res: Response): Promise<any> => {
  try {
    const { message, session_id } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const result: IConversationResult = await conversationManager.handleMessage({
      message,
      sessionId: session_id
    });

    return res.json(result);
  } catch (err: any) {
    console.error('Error in /chat endpoint:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

const handleVoice = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Empty audio file uploaded.' });
    }

    const sessionId = req.body.session_id || null;
    const result: IConversationResult = await conversationManager.handleMessage({
      message: '',
      sessionId,
      audioBuffer: req.file.buffer,
      filename: req.file.originalname || 'recording.webm',
      mimeType: req.file.mimetype || 'audio/webm'
    });

    return res.json(result);
  } catch (err: any) {
    console.error('Error in /voice endpoint:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

app.post('/chat', handleChat);
app.post('/api/chat', handleChat);

app.post('/voice', upload.single('audio'), handleVoice);
app.post('/api/voice', upload.single('audio'), handleVoice);

// ============================================================================
// SESSION MANAGEMENT ENDPOINTS
// ============================================================================

app.get('/session/:session_id', (req: Request, res: Response): any => {
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
});

app.post('/reset/:session_id', (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  sessionStore.reset(sessionId);
  return res.json({ status: 'reset_successful', session_id: sessionId });
});

// ============================================================================
// PHASE 2: RECOMMENDATION ENGINE & WHAT-IF ANALYTICS
// ============================================================================

app.post('/api/recommend', async (req: Request, res: Response): Promise<any> => {
  try {
    const rawSchema = req.body.schema || req.body;
    const schema = new CustomerSchema(rawSchema);
    const recs: IRecommendationResponse = await recommendationEngine.generateRecommendations(schema);
    return res.json(recs);
  } catch (err: any) {
    console.error('Error in /api/recommend:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/recommend/what-if', async (req: Request, res: Response): Promise<any> => {
  try {
    const { session_id, max_installation_days, has_gstin, gstin } = req.body;
    const session = session_id ? sessionStore.get(session_id) : null;
    const baseSchema = session ? session.schema : new CustomerSchema(req.body.schema || {});

    const testSchema = new CustomerSchema(baseSchema.toJSON());
    if (max_installation_days !== undefined) testSchema.max_installation_days = max_installation_days;
    if (has_gstin !== undefined) testSchema.has_gstin = has_gstin;
    if (gstin !== undefined) testSchema.gstin = gstin;

    const recs = await recommendationEngine.generateRecommendations(testSchema);
    return res.json({
      simulation_params: { max_installation_days, has_gstin, gstin },
      recommendations: recs
    });
  } catch (err: any) {
    console.error('Error in /api/recommend/what-if:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/segment/resolve', async (req: Request, res: Response): Promise<any> => {
  try {
    const { business_type } = req.body;
    if (!business_type) {
      return res.status(400).json({ error: 'business_type is required.' });
    }
    const result = await targetSegmentService.resolveSegment(business_type);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// REGISTRY & DATA CATALOGUE LOOKUP APIS
// ============================================================================

app.get('/api/lookup/gstin/:gstin', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = await dbClient.findGstin(req.params.gstin);
    if (!data) return res.status(404).json({ error: 'GSTIN not found in registry' });
    return res.json({ found: true, record: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/udyam/:udyam', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = await dbClient.findUdyam(req.params.udyam);
    if (!data) return res.status(404).json({ error: 'Udyam registration not found in registry' });
    return res.json({ found: true, record: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (_req: Request, res: Response): Promise<any> => {
  try {
    const products = await dbClient.getProducts();
    return res.json({ count: products.length, products });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/database/status', async (_req: Request, res: Response): Promise<any> => {
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

app.get('/database', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'frontend/database.html'));
});

app.get('/api/database/table/:name', async (req: Request, res: Response): Promise<any> => {
  try {
    const tableName = String(req.params.name).toLowerCase();
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

    if (dbClient.isConnected) {
      try {
        const queryRes = await dbClient.query(`SELECT * FROM ${tableName} LIMIT 500`);
        if (queryRes && queryRes.rows.length > 0) {
          return res.json({ count: queryRes.rows.length, source: 'PostgreSQL Docker Database', rows: queryRes.rows });
        }
      } catch (_) {}
    }

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

    return res.json({ count: 0, rows: [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PHASE 3 & 4: SMART KYC & ORDER LIFECYCLE
// ============================================================================

app.post('/api/kyc/upload', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const docType = (req.body.doc_type || 'gstin') as any;
    const sessionId = req.body.session_id || 'anonymous-session';
    const userId = req.body.user_id || sessionId;
    const expectedName = req.body.expected_name || null;

    const result: IKycVerificationResult = await smartOcrService.processAndVerifyDocument({
      buffer: req.file.buffer,
      docType,
      sessionId,
      userId,
      expectedName
    });

    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/kyc/upload:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/accept', async (req: Request, res: Response): Promise<any> => {
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
  } catch (err: any) {
    console.error('Error in /api/orders/accept:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/reject', async (req: Request, res: Response): Promise<any> => {
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
  } catch (err: any) {
    console.error('Error in /api/orders/reject:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/dashboard', async (_req: Request, res: Response): Promise<any> => {
  try {
    const data = await orderService.getSalesDashboardData();
    return res.json(data);
  } catch (err: any) {
    console.error('Error in /api/sales/dashboard:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SYSTEM HEALTH & FRONTEND SERVING
// ============================================================================

app.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'healthy',
    backend: 'Node.js (TypeScript with tsx)',
    service: config.appName,
    database_connected: dbClient.isConnected
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ============================================================================
// SERVER BOOTSTRAP
// ============================================================================

runEtl().catch((e: Error) => console.warn('Background ETL Notice:', e.message));

const PORT = config.port || 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Airtel Business Discovery Agent (TypeScript) running on http://localhost:${PORT}`);
});

export default app;
