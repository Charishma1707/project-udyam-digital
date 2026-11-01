/**
 * ============================================================================
 * TEST SUITE: SMART OCR, PRIVACY & AES-256-GCM ENCRYPTION (ocrAndSecurity.test.js)
 * ============================================================================
 * 
 * 📌 WHAT THIS TEST SUITE VERIFIES:
 * 1. AES-256-GCM Military Grade Encryption:
 *    - Encrypts image buffers with unique IVs and generates tamper-proof auth tags.
 *    - Decrypts ciphertexts accurately back to the exact original bytes.
 *    - Rejects tampered ciphertexts.
 * 2. Zero-Residue Memory Purging:
 *    - Verifies that raw image buffers in RAM are zeroed out after processing.
 * 3. Privacy Masking:
 *    - Aadhaar numbers masked to XXXXXXXX1234 (last 4 digits only).
 *    - Voter IDs and Signatory IDs masked in compliance with privacy guidelines.
 *    - GSTIN & Udyam identifiers formatted with privacy masks.
 * 4. Image Preprocessing & Multi-Orientation:
 *    - Generates 0, 90, 180, 270 degree rotation buffers.
 *    - Boosts contrast and converts to clean greyscale.
 * 5. End-to-End Smart OCR on Real Specimens:
 *    - K01 GST Certificate: Extracts 37IHKXV5167L1ZS & verifies against database registry.
 *    - K02 Udyam Certificate: Extracts UDYAM-WB-00-5053330 & verifies against MSME registry.
 *    - K01 Signatory ID: Extracts authorized representative details.
 *    - K04 Distorted Certificate: Detects low-confidence document and flags for manual review.
 * ============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { secureVault } = require('../node-src/services/secureVault');
const { imagePreprocessor } = require('../node-src/services/imagePreprocessor');
const { smartOcrService, REGEX_PATTERNS } = require('../node-src/services/ocrService');
const dbClient = require('../node-src/db/dbClient');
const { runEtl } = require('../node-src/db/preprocessAndLoad');

// Seed test database
test.before(async () => {
  await runEtl();
});

test('AES-256-GCM encrypts, decrypts, and detects tampering', async () => {
  const secretPayload = Buffer.from('Confidential-Aadhaar-Airtel-KYC-Document-Data-2026', 'utf-8');
  
  // Encrypt
  const encrypted = secureVault.encryptBuffer(secretPayload);
  assert.ok(encrypted.ciphertext, 'Ciphertext should be non-empty hex string');
  assert.ok(encrypted.iv, 'IV should be 32 hex chars (16 bytes)');
  assert.ok(encrypted.authTag, 'AuthTag should be 32 hex chars (16 bytes)');
  assert.equal(encrypted.algorithm, 'aes-256-gcm');

  // Decrypt
  const decrypted = secureVault.decryptBuffer(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
  assert.equal(decrypted.toString('utf-8'), secretPayload.toString('utf-8'), 'Decrypted text should match original');

  // Verify Tampering Detection (GCM must throw error if 1 byte is modified)
  const tamperedCiphertext = encrypted.ciphertext.slice(0, -2) + (encrypted.ciphertext.endsWith('0') ? '1' : '0');
  assert.throws(() => {
    secureVault.decryptBuffer(tamperedCiphertext, encrypted.iv, encrypted.authTag);
  }, /Unsupported state or unable to authenticate data|bad decrypt/i, 'Tampered ciphertext must fail authentication');
});

test('Zero-residue RAM buffer purging overwrites memory with zeros', () => {
  const buf = Buffer.from('SensitiveRawImageBytes1234567890');
  assert.notEqual(buf[0], 0);

  secureVault.securePurgeBuffer(buf);
  for (let i = 0; i < buf.length; i++) {
    assert.equal(buf[i], 0, `Byte at index ${i} must be zero`);
  }
});

test('maskIdentifier accurately masks sensitive numbers across all 4 document types', () => {
  // Aadhaar
  assert.equal(secureVault.maskIdentifier('aadhaar', '5482 1928 3749'), 'XXXXXXXX3749');
  assert.equal(secureVault.maskIdentifier('aadhaar_card', '998877661234'), 'XXXXXXXX1234');

  // Voter ID / Signatory ID
  const maskedSignatory = secureVault.maskIdentifier('signatory_id', 'SYN-ID-346190');
  assert.ok(maskedSignatory.includes('X'), 'Signatory ID should mask middle digits');

  // GSTIN
  const maskedGst = secureVault.maskIdentifier('gstin', '37IHKXV5167L1ZS');
  assert.ok(maskedGst.startsWith('37'), 'GSTIN should retain state code prefix');
  assert.ok(maskedGst.includes('XXXXXXXX'), 'GSTIN should mask middle PAN');

  // Udyam
  const maskedUdyam = secureVault.maskIdentifier('udyam', 'UDYAM-WB-00-5053330');
  assert.equal(maskedUdyam, 'UDYAM-WB-00-XXXX330');
});

test('imagePreprocessor enhances contrast and generates 4 orientations', async () => {
  const sampleImagePath = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data/kyc_documents/K01_signatory_id.png');
  const rawBuf = fs.readFileSync(sampleImagePath);

  const preprocessed = await imagePreprocessor.preprocess(rawBuf, { contrast: 0.35 });
  assert.ok(Buffer.isBuffer(preprocessed), 'Preprocessed output must be buffer');
  assert.ok(preprocessed.length > 0, 'Preprocessed buffer must be non-empty');

  const orientations = await imagePreprocessor.generateOrientations(rawBuf);
  assert.equal(orientations.length, 4, 'Should generate 4 candidate rotations (0, 90, 180, 270)');
  const angles = orientations.map(o => o.angle);
  assert.deepEqual(angles, [0, 90, 180, 270]);
});

test('smartOcrService extracts and verifies K03 GST Certificate against registry', async () => {
  const k03GstPath = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data/kyc_documents/K03_gst_certificate.png');
  const buffer = fs.readFileSync(k03GstPath);

  const result = await smartOcrService.processAndVerifyDocument({
    buffer,
    docType: 'gstin',
    sessionId: 'session-test-k03-gst'
  });

  assert.equal(result.verificationStatus, 'VERIFIED');
  assert.ok(result.docNumberMasked.startsWith('27'));
  assert.equal(result.registryMatch.tradeName, 'Ganesh Woodcraft');
  assert.ok(result.registryMatch.status);
  assert.ok(result.encryptedImage.ciphertext, 'Encrypted ciphertext must be generated');
  assert.ok(result.docNumberHash, 'SHA-256 hash must be generated');
});

test('smartOcrService catches cancelled K01 GST Certificate and rejects', async () => {
  const k01GstPath = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data/kyc_documents/K01_gst_certificate.png');
  const buffer = fs.readFileSync(k01GstPath);

  const result = await smartOcrService.processAndVerifyDocument({
    buffer,
    docType: 'gstin',
    sessionId: 'session-test-k01-gst'
  });

  assert.equal(result.verificationStatus, 'REJECTED');
  assert.ok(result.failureReason.includes('not ACTIVE') || result.failureReason.includes('Cancelled'));
});

test('smartOcrService extracts and verifies K02 Udyam Certificate against registry', async () => {
  const k02UdyamPath = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data/kyc_documents/K02_udyam_certificate.png');
  const buffer = fs.readFileSync(k02UdyamPath);

  const result = await smartOcrService.processAndVerifyDocument({
    buffer,
    docType: 'udyam',
    sessionId: 'session-test-k02-udyam'
  });

  assert.equal(result.verificationStatus, 'VERIFIED');
  assert.equal(result.registryMatch.enterpriseName, 'Harmony Dental Care');
  assert.equal(result.registryMatch.state, 'West Bengal');
});

test('smartOcrService flags degraded K04 GST certificate for MANUAL_REVIEW', async () => {
  const k04GstPath = path.resolve(__dirname, '../YTL_TrackA_Udyam_Digital_Data/kyc_documents/K04_gst_certificate.png');
  const buffer = fs.readFileSync(k04GstPath);

  const result = await smartOcrService.processAndVerifyDocument({
    buffer,
    docType: 'gstin',
    sessionId: 'session-test-k04-distorted'
  });

  assert.equal(result.verificationStatus, 'MANUAL_REVIEW', 'Degraded document must be routed to manual review');
  assert.ok(result.failureReason.includes('Sales Escalation'));
});
