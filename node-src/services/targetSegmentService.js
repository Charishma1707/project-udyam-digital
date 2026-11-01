/**
 * ============================================================================
 * SERVICE: Target Segment Resolver (targetSegmentService.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Deterministically maps any business type extracted from the customer (e.g. "Sri Lakshmi Bakery")
 * into one of the 4 official Airtel Business canonical segments:
 * 1. "Micro Retail & Services"
 * 2. "Professional Offices"
 * 3. "Small Manufacturing"
 * 4. "Multi-site Businesses"
 * 
 * WHY NOT LET THE LLM GUESS THE SEGMENT?
 * Customers never say "I belong to Professional Offices"; they say "I run a CA firm".
 * Having the LLM guess target segments causes hallucinations and inconsistent product filtering.
 * Instead, this service uses a 4-tier deterministic waterfall:
 * 
 * THE 4-TIER RESOLUTION WATERFALL:
 * Tier 1: Exact Match (Fast, zero AI)
 *         Checks normalized text directly against `business_type_mapping.json`.
 * Tier 2: Keyword / Compound Match (Fast, zero AI)
 *         Matches compound phrases (e.g. "Bakery Hill" contains "bakery" -> Micro Retail & Services).
 * Tier 3: Fuzzy Similarity with Fuse.js (Fast, zero AI)
 *         Handles typos or minor spelling differences (e.g. "Textil Unit" -> Small Manufacturing).
 * Tier 4: LLM Fallback (Constrained classification)
 *         Only for completely novel business types not seen in historical data (e.g. "EV Charging Hub").
 *         Caches the newly classified mapping in memory for instant reuse.
 * 
 * HOW TO USE:
 * const { targetSegmentService } = require('./targetSegmentService');
 * const res = await targetSegmentService.resolveSegment("Bakery Hill");
 * // returns: { segment: "Micro Retail & Services", method: "keyword", confidence: 0.92 }
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const { CANONICAL_SEGMENTS } = require('../../preprocessing/normalize-segments');
const { sarvamClient } = require('./sarvamClient');

// Path to precomputed business type mapping table
const MAPPING_FILE = path.resolve(__dirname, '../../data/business_type_mapping.json');

class TargetSegmentService {
  constructor(client = sarvamClient) {
    this.client = client;
    this.mapping = {};
    this.fuse = null;
    this.loadMappings();
  }

  /**
   * Loads mapping dictionary from data/business_type_mapping.json and initializes Fuse.js.
   */
  loadMappings() {
    try {
      if (fs.existsSync(MAPPING_FILE)) {
        this.mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
      } else {
        // Safe baseline defaults in case file is being recreated
        this.mapping = {
          "restaurant": "Micro Retail & Services",
          "cafe": "Micro Retail & Services",
          "bakery": "Micro Retail & Services",
          "kirana store": "Micro Retail & Services",
          "dental clinic": "Professional Offices",
          "ca firm": "Professional Offices",
          "law office": "Professional Offices",
          "textile unit": "Small Manufacturing",
          "electronics retail chain": "Multi-site Businesses"
        };
      }

      // Initialize Fuse.js for fuzzy search over known business types
      const keys = Object.keys(this.mapping).map((key) => ({
        name: key,
        segment: this.mapping[key]
      }));

      this.fuse = new Fuse(keys, {
        keys: ['name'],
        includeScore: true,
        threshold: 0.4, // Match tolerance: 0.0 is exact match, 1.0 matches anything
        minMatchCharLength: 3
      });
    } catch (err) {
      console.warn('⚠️ [TargetSegmentService]: Failed to load mapping file:', err.message);
    }
  }

  /**
   * Helper: Normalizes input text (lowercase, alphanumeric only, trimmed).
   */
  normalize(text) {
    if (!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Resolves a business type string into a canonical segment using the 4-tier waterfall.
   * @param {string} businessType - Raw business type string (e.g. "Bakery Hill", "Dental Clinic")
   * @returns {Promise<{ segment: string, method: string, confidence: number }>}
   */
  async resolveSegment(businessType) {
    if (!businessType || !businessType.trim()) {
      return { segment: null, method: 'none', confidence: 0 };
    }

    const raw = businessType.trim();
    const clean = this.normalize(raw);

    // ------------------------------------------------------------------------
    // TIER 1: EXACT MATCH (100% deterministic, zero AI)
    // ------------------------------------------------------------------------
    for (const [key, seg] of Object.entries(this.mapping)) {
      if (this.normalize(key) === clean) {
        return { segment: seg, method: 'exact', matched_as: key, confidence: 1.0 };
      }
    }

    // ------------------------------------------------------------------------
    // TIER 2: KEYWORD / COMPOUND MATCH (Sorted by length descending)
    // ------------------------------------------------------------------------
    const sortedEntries = Object.entries(this.mapping).sort((a, b) => b[0].length - a[0].length);
    for (const [key, seg] of sortedEntries) {
      const normKey = this.normalize(key);
      const words = clean.split(' ');
      if (clean.includes(normKey) || (words.length === 1 && normKey.includes(clean) && !normKey.includes('chain') && !normKey.includes('group'))) {
        return { segment: seg, method: 'keyword', matched_as: key, confidence: 0.92 };
      }
    }

    // ------------------------------------------------------------------------
    // TIER 3: FUZZY SIMILARITY SEARCH WITH FUSE.JS (Zero AI)
    // ------------------------------------------------------------------------
    if (this.fuse) {
      const results = this.fuse.search(clean);
      if (results && results.length > 0) {
        const best = results[0];
        const similarity = 1 - best.score; // Convert Fuse distance to similarity (0 to 1)
        if (similarity >= 0.60) {
          return {
            segment: best.item.segment,
            method: 'fuzzy',
            matched_as: best.item.name,
            confidence: parseFloat(similarity.toFixed(2))
          };
        }
      }
    }

    // ------------------------------------------------------------------------
    // TIER 4: LLM FALLBACK (Constrained single-word classification)
    // ------------------------------------------------------------------------
    try {
      const prompt = `Classify this business type into EXACTLY ONE of the 4 allowed categories:
- Micro Retail & Services
- Professional Offices
- Small Manufacturing
- Multi-site Businesses

Business Type: "${raw}"

Respond with ONLY the category name. No punctuation, no markdown, no other words.`;

      const response = await this.client.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        maxTokens: 30
      });

      const cleanedResp = response.replace(/[^\w\s&]/g, '').trim();
      for (const canonical of CANONICAL_SEGMENTS) {
        if (canonical.toLowerCase() === cleanedResp.toLowerCase()) {
          // Cache newly learned mapping in memory
          this.mapping[raw] = canonical;
          return { segment: canonical, method: 'llm_fallback', confidence: 0.85 };
        }
      }
    } catch (llmErr) {
      console.warn('⚠️ [TargetSegmentService]: LLM classification error:', llmErr.message);
    }

    // Safe final fallback
    return { segment: 'Micro Retail & Services', method: 'default_fallback', confidence: 0.5 };
  }
}

const targetSegmentService = new TargetSegmentService();

module.exports = {
  TargetSegmentService,
  targetSegmentService
};
