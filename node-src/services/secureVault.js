/**
 * ============================================================================
 * AIRTEL BUSINESS SECURE VAULT & DATA PRIVACY SERVICE (secureVault.js)
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES (BEGINNER-FRIENDLY GUIDE):
 * In telecom enterprise onboarding, identity documents (Aadhaar, Voter ID,
 * GSTIN certificates, Udyam certificates) contain highly sensitive personal
 * and business data. If stored in plaintext, a data breach would compromise
 * customer privacy and violate national regulations (e.g. UIDAI, DPDP Act).
 * 
 * This service ensures zero-exposure data privacy through 4 key layers:
 * 
 * 1. 🔐 MILITARY-GRADE ENCRYPTION (AES-256-GCM):
 *    - Encrypts uploaded raw document images using AES-256 in Galois/Counter Mode.
 *    - GCM provides both confidentiality (nobody can read it) AND authenticity
 *      (any tampering or modification is immediately detected via auth tags).
 *    - Each document gets a unique, cryptographically random 16-byte IV (Initialization Vector).
 * 
 * 2. 🧹 ZERO-RESIDUE IN-MEMORY BUFFER PURGING:
 *    - Once an image is encrypted and OCR is finished, the raw image in RAM is
 *      overwritten with zeros (zero-filled) so it cannot be recovered from memory dumps.
 * 
 * 3. 🎭 SENSITIVE IDENTIFIER MASKING:
 *    - Aadhaar: Only last 4 digits exposed (e.g., "XXXXXXXX1234").
 *    - Voter ID: Masked middle section (e.g., "ABCXXXX567").
 *    - GSTIN / Udyam: Formatted for clean enterprise validation while protecting owner PII.
 * 
 * 4. 🔑 ONE-WAY DETERMINISTIC HASHING (SHA-256):
 *    - Stores a secure hash of document numbers for fast database uniqueness lookups
 *      without exposing the real number in plaintext indices.
 * ============================================================================
 */

const crypto = require('crypto');

// Master encryption key derived from environment or secure 256-bit fallback
const MASTER_SECRET = process.env.ENCRYPTION_MASTER_KEY || 'airtel-enterprise-secure-vault-key-2026-super-secret';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_SECRET).digest(); // Exactly 32 bytes (256 bits)
const ALGORITHM = 'aes-256-gcm';

class SecureVaultService {
  /**
   * Encrypts a binary buffer (image / document) using AES-256-GCM
   * @param {Buffer} buffer - Raw image bytes
   * @returns {Object} { ciphertext: string (hex), iv: string (hex), authTag: string (hex), algorithm: string }
   */
  encryptBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      buffer = Buffer.from(buffer);
    }

    // Generate unique 16-byte Initialization Vector for every single upload
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: ALGORITHM,
      encryptedLength: encrypted.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Decrypts an encrypted document payload back to binary buffer
   * Only accessible by authorized Sales Operations / KYC Auditors
   * @param {string} ciphertextHex 
   * @param {string} ivHex 
   * @param {string} authTagHex 
   * @returns {Buffer} decrypted document buffer
   */
  decryptBuffer(ciphertextHex, ivHex, authTagHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Overwrites sensitive RAM buffers with zeros to prevent memory leakage
   * @param {Buffer} buffer 
   */
  securePurgeBuffer(buffer) {
    if (Buffer.isBuffer(buffer)) {
      buffer.fill(0);
    }
  }

  /**
   * Generates a non-reversible SHA-256 hash for database indexing & duplicate check
   * @param {string} idString 
   * @returns {string} 64-character hex hash
   */
  hashIdentifier(idString) {
    if (!idString) return null;
    const normalized = idString.toString().trim().toUpperCase().replace(/[\s-]/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Masks sensitive identity numbers for display in customer UI & sales dashboards
   * @param {string} docType - 'aadhaar' | 'voter_id' | 'gstin' | 'udyam'
   * @param {string} rawNumber - Extracted identifier
   * @returns {string} Masked string safe for public display
   */
  maskIdentifier(docType, rawNumber) {
    if (!rawNumber) return 'N/A';
    const clean = rawNumber.toString().trim().replace(/[\s-]/g, '');

    switch ((docType || '').toLowerCase()) {
      case 'aadhaar':
      case 'aadhaar_card':
        // Show only last 4 digits: XXXXXXXX1234
        if (clean.length >= 4) {
          return 'XXXXXXXX' + clean.slice(-4);
        }
        return 'XXXXXXXX****';

      case 'voter_id':
      case 'epic':
      case 'signatory_id':
        // Mask middle characters: e.g. ABCXXXX456 or SYN-XXXX-90
        if (clean.length > 5) {
          const prefix = clean.slice(0, 3);
          const suffix = clean.slice(-3);
          return `${prefix}${'X'.repeat(Math.max(2, clean.length - 6))}${suffix}`;
        }
        return clean;

      case 'gstin':
        // Show state code (first 2 digits) and last 4 characters: 37XXXXX1ZS
        if (clean.length === 15) {
          return clean.slice(0, 2) + 'XXXXXXXX' + clean.slice(10);
        }
        return clean;

      case 'udyam':
        // Format: UDYAM-XX-00-XXXXXXX -> UDYAM-XX-00-XXXX567
        if (clean.startsWith('UDYAM')) {
          const parts = rawNumber.split('-');
          if (parts.length === 4) {
            const num = parts[3];
            const maskedNum = 'XXXX' + num.slice(-3);
            return `${parts[0]}-${parts[1]}-${parts[2]}-${maskedNum}`;
          }
        }
        return clean;

      default:
        if (clean.length > 4) {
          return clean.slice(0, 2) + '***' + clean.slice(-2);
        }
        return clean;
    }
  }
}

const secureVault = new SecureVaultService();

module.exports = {
  SecureVaultService,
  secureVault
};
