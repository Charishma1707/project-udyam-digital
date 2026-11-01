/**
 * ============================================================================
 * SERVICE: In-Memory Customer Session Store (sessionStore.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Manages customer conversation sessions across turns in memory.
 * 
 * EACH SESSION TRACKS:
 * 1. session_id           : Unique UUID identifying the active customer session
 * 2. schema               : Live CustomerSchema being incrementally populated
 * 3. conversation_history : Chronological list of user and assistant messages
 * 4. active_language      : Detected conversational language (English, Telugu, Hindi, etc.)
 * 5. recommendations      : Cached Phase 2 recommendations once 100% complete
 * 
 * HOW TO USE:
 * const { sessionStore } = require('./sessionStore');
 * const session = sessionStore.getOrCreate(sessionId);
 * sessionStore.reset(sessionId); // Clears session back to initial state
 * ============================================================================
 */

const CustomerSchema = require('../models/customerSchema');
const crypto = require('crypto');

/**
 * Encapsulates the state of a single customer discovery session.
 */
class SessionState {
  constructor(sessionId) {
    this.session_id = sessionId;
    this.schema = new CustomerSchema();
    this.conversation_history = [];
    this.active_language = 'English';
    this.recommendations = null;
  }
}

/**
 * Thread-safe Map-based session store.
 */
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Retrieves an existing session or generates a new one if not found.
   * @param {string} [sessionId] - Optional existing session ID
   * @returns {SessionState} Active session state instance
   */
  getOrCreate(sessionId) {
    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new SessionState(sessionId));
    }

    return this.sessions.get(sessionId);
  }

  /**
   * Retrieves an existing session by ID or returns null.
   * @param {string} sessionId
   * @returns {SessionState|null}
   */
  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Clears a session back to an empty initial state.
   * @param {string} sessionId
   * @returns {SessionState} Fresh session state
   */
  reset(sessionId) {
    const fresh = new SessionState(sessionId);
    this.sessions.set(sessionId, fresh);
    return fresh;
  }
}

const defaultSessionStore = new SessionStore();

module.exports = {
  SessionStore,
  sessionStore: defaultSessionStore
};
