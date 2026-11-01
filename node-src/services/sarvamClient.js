/**
 * ============================================================================
 * AIRTEL BUSINESS AI AGENT - SARVAM AI API CLIENT
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * This client communicates with Sarvam AI's specialized Indic AI services:
 * 1. Speech-to-Text (STT) via `saaras:v3`:
 *    - Converts raw recorded customer audio (WebM/WAV) into written text.
 *    - Built specifically to handle 10+ Indian languages (Hindi, Telugu, Tamil, etc.)
 *      and code-mixed "Hinglish" / multilingual business phrasing.
 * 2. Chat Completions via `sarvam-105b-conversations`:
 *    - Sends prompt messages to Sarvam's LLM to extract structured facts
 *      into JSON or generate localized Hindi/Indic follow-up questions.
 * 
 * 🛡️ GRACEFUL FALLBACK & MOCK MODE:
 * When testing offline or running unit tests without an active API key,
 * mockMode safely returns valid mock data so development is never blocked.
 * 
 * 📋 USAGE EXAMPLE:
 *   const { sarvamClient } = require('./sarvamClient');
 *   const text = await sarvamClient.transcribeAudio({ buffer, mimeType: 'audio/webm' });
 *   const reply = await sarvamClient.chatCompletion({ messages });
 * ============================================================================
 */

const { SarvamAIClient } = require('sarvamai');
const config = require('../config');

class SarvamClient {
  /**
   * Initializes the client with an API key and optional mock flag.
   * @param {string} apiKey - Sarvam API Subscription Key
   * @param {boolean} mockMode - When true, skips real network calls for testing
   */
  constructor(apiKey = config.sarvamApiKey, mockMode = false) {
    this.apiKey = apiKey;
    this.mockMode = mockMode;
    this.client = null;

    if (!this.mockMode && this.apiKey) {
      this.client = new SarvamAIClient({ apiSubscriptionKey: this.apiKey });
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: LLM Chat Completion (for Schema Extraction)
  // --------------------------------------------------------------------------
  /**
   * Sends conversation messages to the Sarvam Chat LLM.
   * @param {Object} options
   * @param {Array} options.messages - Array of { role: 'system'|'user', content: string }
   * @param {string} options.model - Model identifier (default: sarvam-105b-conversations)
   * @param {number} options.temperature - Sampling temperature (low = 0.1 for deterministic JSON)
   * @param {number} options.maxTokens - Token limit for response
   * @returns {Promise<string>} The assistant's text response
   */
  async chatCompletion({ messages, model = config.sarvamChatModel, temperature = 0.1, maxTokens = 350 }) {
    if (this.mockMode) {
      return '{}';
    }

    try {
      const response = await this.client.chat.completions({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });
      return (response.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
      console.error('Sarvam Chat API error (Node.js):', err.message);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 2: Speech-to-Text Transcription (saaras:v3)
  // --------------------------------------------------------------------------
  /**
   * Transcribes an audio recording buffer to text.
   * @param {Object} options
   * @param {Buffer} options.buffer - Raw audio file buffer from browser
   * @param {string} options.filename - Audio file name (e.g. recording.webm)
   * @param {string} options.mimeType - Audio mime type (e.g. audio/webm)
   * @param {string} options.languageCode - Indic language code or 'unknown'
   * @returns {Promise<string>} Transcribed text string
   */
  async transcribeAudio({ buffer, filename = 'recording.webm', mimeType = 'audio/webm', languageCode = 'unknown' }) {
    if (this.mockMode) {
      return 'Mock transcribed speech';
    }

    try {
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('file', blob, filename);
      formData.append('model', config.sarvamSttModel);
      formData.append('language_code', languageCode);

      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sarvam STT HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return (data.transcript || '').trim();
    } catch (err) {
      console.error('Sarvam STT API error (Node.js):', err.message);
      throw err;
    }
  }
}

// Singleton default client instance for app-wide use
const defaultClient = new SarvamClient();

module.exports = {
  SarvamClient,
  sarvamClient: defaultClient
};

