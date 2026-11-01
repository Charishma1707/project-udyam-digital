/**
 * ============================================================================
 * AIRTEL BUSINESS AI AGENT - CONFIGURATION MODULE
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * This module is the central configuration hub for the application. It loads
 * environment variables (from your system or a local `.env` file) using dotenv,
 * validates required API credentials, and exports a clean settings object that
 * the rest of the application imports.
 * 
 * 💡 WHY WE DO THIS:
 * Instead of scattering `process.env.VAR_NAME` all across the codebase, having
 * a single config file ensures:
 * 1. Default values are defined in one place (e.g. port 8000, model names).
 * 2. Warnings are logged early at startup if essential keys (like SARVAM_API_KEY)
 *    are missing.
 * 3. Type conversions (like string to integer for PORT) happen once.
 * 
 * ⚙️ CONFIGURATION KEYS:
 * - sarvamApiKey: Your API key from https://dashboard.sarvam.ai
 * - sarvamChatModel: LLM used for extraction (default: sarvam-105b-conversations)
 * - sarvamSttModel: Model used for Indian Speech-to-Text (default: saaras:v3)
 * - port: HTTP server port (default: 8000)
 * - appName: Display name of the service
 * ============================================================================
 */

require('dotenv').config();

const config = {
  // Authentication & Sarvam AI Credentials
  sarvamApiKey: process.env.SARVAM_API_KEY || '',
  sarvamChatModel: process.env.SARVAM_CHAT_MODEL || 'sarvam-105b-conversations',
  sarvamSttModel: process.env.SARVAM_STT_MODEL || 'saaras:v3',

  // Server Networking
  port: parseInt(process.env.PORT || '8000', 10),
  appName: 'Airtel Business - Phase 1 Customer Discovery & Phase 2 Recommendations (Node.js)'
};

// Helpful startup check: alert developer if API key is not configured
if (!config.sarvamApiKey) {
  console.warn('⚠️ WARNING: SARVAM_API_KEY is not set in environment or .env file.');
  console.warn('   The assistant will run with mock LLM responses until a key is added.');
}

module.exports = config;

