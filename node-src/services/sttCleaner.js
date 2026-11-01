/**
 * ============================================================================
 * SERVICE: Speech-to-Text Natural Text Cleaner (sttCleaner.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Cleans transcripts produced by Sarvam Speech-to-Text before passing to the LLM.
 * 
 * WHY IS THIS NEEDED?
 * When business owners speak naturally into microphones, speech engines often produce:
 * - Literal spoken punctuation words: e.g. "We need WiFi forward slash CCTV"
 * - Literal punctuation marks: e.g. "Internet/WiFi", "Airtel-Broadband"
 * 
 * CRITICAL RULE (Identifier Preservation):
 * When replacing hyphens and slashes, we must NEVER corrupt official registration IDs:
 * - GSTIN format: e.g. "29ABCDE1234F1Z5"
 * - Udyam format: e.g. "UDYAM-MH-01-0012345"
 * 
 * HOW IT WORKS (5 Steps):
 * 1. Finds and shields GSTIN & Udyam IDs with temporary placeholder tokens
 * 2. Replaces spoken words like "slash" with " and ", and "hyphen" with a space
 * 3. Replaces punctuation like "/" between words with " and "
 * 4. Restores the shielded GSTIN & Udyam IDs exactly as originally spoken
 * 5. Normalizes whitespace
 * ============================================================================
 */

class STTCleaner {
  // Regex to detect official 19-character Udyam registration numbers
  static UDYAM_REGEX = /UDYAM-[A-Z]{2}-\d{2}-\d{7}/gi;

  // Regex to detect official 15-character Indian GSTIN identifiers
  static GSTIN_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/gi;

  /**
   * Cleans raw speech transcripts into smooth natural text while protecting IDs.
   * @param {string} text - Raw transcript from speech-to-text
   * @returns {string} Cleaned natural transcript
   */
  static clean(text) {
    if (!text || typeof text !== 'string') return '';

    // Step 1: Temporarily shield GSTIN and Udyam identifiers
    const udyamMatches = text.match(this.UDYAM_REGEX) || [];
    const gstinMatches = text.match(this.GSTIN_REGEX) || [];

    const protectedTokens = {};
    udyamMatches.forEach((match, i) => {
      const token = `TOKENXUDYAMX${i}X`;
      protectedTokens[token] = match;
      text = text.replace(match, token);
    });

    gstinMatches.forEach((match, i) => {
      const token = `TOKENXGSTINX${i}X`;
      protectedTokens[token] = match;
      text = text.replace(match, token);
    });

    // Step 2: Replace spoken words "slash", "hyphen", "underscore"
    text = text.replace(/\b(forward\s+slash|slash|backslash)\b/gi, ' and ');
    text = text.replace(/\b(hyphen|dash)\b/gi, ' ');
    text = text.replace(/\bunderscore\b/gi, ' ');

    // Step 3: Replace literal punctuation characters between words
    // e.g., "Internet/CCTV" -> "Internet and CCTV"
    text = text.replace(/([A-Za-z0-9])\s*\/\s*([A-Za-z0-9])/g, '$1 and $2');
    // e.g., "Internet-WiFi" -> "Internet WiFi"
    text = text.replace(/([A-Za-z0-9])\s*[-_]\s*([A-Za-z0-9])/g, '$1 $2');

    // Step 4: Restore protected tokens
    for (const [token, original] of Object.entries(protectedTokens)) {
      text = text.replace(token, original);
    }

    // Step 5: Normalize extra spaces
    return text.replace(/\s+/g, ' ').trim();
  }
}

module.exports = STTCleaner;
