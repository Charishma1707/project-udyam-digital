/**
 * ============================================================================
 * SERVICE: Schema Extraction Agent (extractor.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Calls Sarvam Chat LLM (sarvam-105b) with temperature 0.0 to parse structured facts
 * from the customer's conversational messages into valid JSON.
 * 
 * STRICT PROMPT INSTRUCTIONS & BUSINESS RULES:
 * 1. Extract ONLY facts explicitly stated by the customer.
 * 2. NEVER invent, hallucinate, or infer missing values.
 * 3. NEVER recommend products, packages, or pricing.
 * 4. Multi-entity extraction: If the customer provides multiple pieces of information at once
 *    (e.g., "I run a bakery in Hyderabad with 10 staff and need Wi-Fi"), extracts ALL of them.
 * 5. Budget Routing: Distinguishes 'monthly_telecom_spend_inr' from total IT 'overall_budget'.
 * 6. Registration Parsing: Normalizes GSTIN ("Y"/"N") and Udyam ("Y"/"N") confirmations.
 * 7. Language Detection: Automatically detects customer language (English, Hindi, Telugu, Tamil, etc.).
 * 
 * HOW TO USE:
 * const { schemaExtractor } = require('./extractor');
 * const { extracted } = await schemaExtractor.extractWithMeta(currentSchema, userMessage, history);
 * ============================================================================
 */

const { sarvamClient } = require('./sarvamClient');

// System prompt that forces strict structured JSON extraction without chat banter
const SYSTEM_EXTRACTION_PROMPT = `You are the Schema Extraction Agent for Airtel Business Customer Discovery.
Your ONLY responsibility is to extract structured customer facts from the ongoing conversation and update the Customer Schema.

RULES:
1. Extract ONLY facts explicitly stated by the customer.
2. NEVER invent, hallucinate, or infer missing values. If not mentioned, do NOT include it.
3. NEVER recommend products, packages, or services.
4. NEVER formulate questions or conversation.
5. If the customer provides multiple pieces of information at once (e.g., "I run a bakery in Hyderabad with 10 staff and need Wi-Fi"), extract ALL of them:
   - business_type
   - city
   - employee_count
   - needs (as a list)
6. FINANCIAL & BUDGET EXTRACTION RULES:
   - When the user mentions TELECOM BUDGET, MONTHLY BILL, or TELECOM SPEND (e.g., when asked about telecom budget/spend, or says "I pay around ₹2000", "telecom budget is 1800", "monthly bill is 1500", "around 2000 for wifi and sims"):
     You MUST extract it into 'monthly_telecom_spend_inr'.
     DO NOT extract telecom budget into 'overall_budget'.
   - When the user mentions an OVERALL or TOTAL budget for their entire business IT/solutions (e.g., "overall budget is 10000", "total budget 50000"):
     Extract it into 'overall_budget'.
8. REGISTRATION & INSTALLATION EXTRACTION RULES:
   - If user confirms GST (e.g., "Yes, we have GST", "Haan GST hai", "No GST", "No"): extract 'has_gstin' as "Y" or "N". If a 15-character GST number is provided, extract into 'gstin'.
   - If user confirms Udyam/MSME (e.g., "Yes registered under Udyam", "No Udyam"): extract 'has_udyam' as "Y" or "N". If Udyam number is provided, extract into 'udyam_number'.
   - If user mentions installation days or timeline (e.g., "within 5 days", "3 days", "as fast as possible, 2 days"): extract integer into 'max_installation_days'.
9. Detect the language used by the customer in their latest message (e.g., English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Gujarati, Bengali, Punjabi, Odia, Mixed Hindi + English) and set 'preferred_language'.
10. Return ONLY a valid JSON object matching the fields below. No markdown backticks, no explanations.

ALLOWED SCHEMA FIELDS:
- business_name: string or null
- business_type: string or null (e.g., Restaurant, Clinic, Kirana store, Retail shop, CA firm, Manufacturing unit, etc.)
- employee_count: integer or null
- num_sites: integer or null
- annual_turnover_band: string or null
- city: string or null
- state: string or null
- preferred_language: string (e.g. Telugu, Hindi, Tamil, English, Mixed Hindi + English, etc.)
- current_provider: string or null
- current_internet: string or null
- monthly_telecom_spend_inr: integer or null (Monthly telecom spend or monthly telecom budget)
- overall_budget: integer or null (Overall budget for all business IT/hardware solutions)
- needs: list of strings (e.g. ["Internet", "WiFi", "CCTV", "POS Connectivity", "Cloud Email"])
- pain_points: string or null
- future_expansion: string or null
- installation_urgency: string or null
- max_installation_days: integer or null (Maximum acceptable installation days)
- has_gstin: "Y" or "N" or null
- gstin: string or null
- has_udyam: "Y" or "N" or null
- udyam_number: string or null
- contact_name: string or null
- contact_role: string or null
`;

class SchemaExtractionAgent {
  constructor(client = sarvamClient) {
    this.client = client;
  }

  /**
   * Extracts newly mentioned customer facts along with developer debugging trace metadata.
   * @param {Object} currentSchema - Current state of CustomerSchema
   * @param {string} latestMessage - Customer's latest message
   * @param {Array<Object>} conversationHistory - Recent turns
   * @returns {Promise<{ extracted: Object, raw: string, prompt: string }>}
   */
  async extractWithMeta(currentSchema, latestMessage, conversationHistory = []) {
    const historySlice = conversationHistory.slice(-6);
    const historyStr = historySlice.length > 0
      ? historySlice.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
      : '(No prior conversation)';

    const schemaObj = typeof currentSchema.toJSON === 'function' ? currentSchema.toJSON() : currentSchema;
    const cleanSchema = Object.fromEntries(Object.entries(schemaObj).filter(([_, v]) => v !== null));

    const userPrompt = `Current Known Schema:
${JSON.stringify(cleanSchema, null, 2)}

Recent Conversation History:
${historyStr}

Latest Customer Message:
"${latestMessage}"

Extract any newly provided structured customer facts as JSON:`;

    const messages = [
      { role: 'system', content: SYSTEM_EXTRACTION_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const fullPromptLog = `[System Prompt]\n${SYSTEM_EXTRACTION_PROMPT}\n\n[User Prompt]\n${userPrompt}`;

    try {
      const rawResponse = await this.client.chatCompletion({
        messages,
        temperature: 0.0,
        maxTokens: 350
      });

      let cleaned = rawResponse.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim();
      }

      let parsed = {};
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.warn('Failed to parse extraction JSON:', cleaned);
        return { extracted: {}, raw: rawResponse, prompt: fullPromptLog };
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { extracted: {}, raw: rawResponse, prompt: fullPromptLog };
      }

      const validUpdates = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== null && v !== undefined && v !== '') {
          validUpdates[k] = v;
        }
      }

      // Contextual routing: If model extracted 'budget' when the assistant asked for telecom budget/spend
      const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant');
      const askedTelecom = lastAssistantMsg && /telecom/i.test(lastAssistantMsg.content);

      if (validUpdates.budget !== undefined && validUpdates.monthly_telecom_spend_inr === undefined && askedTelecom) {
        validUpdates.monthly_telecom_spend_inr = validUpdates.budget;
        delete validUpdates.budget;
      }

      // Normalize boolean flags for GSTIN & Udyam
      if (validUpdates.has_gstin !== undefined) {
        const g = String(validUpdates.has_gstin).toLowerCase();
        if (g.includes('y') || g === 'true' || g === '1') validUpdates.has_gstin = 'Y';
        else if (g.includes('n') || g === 'false' || g === '0') validUpdates.has_gstin = 'N';
      }
      if (validUpdates.has_udyam !== undefined) {
        const u = String(validUpdates.has_udyam).toLowerCase();
        if (u.includes('y') || u === 'true' || u === '1') validUpdates.has_udyam = 'Y';
        else if (u.includes('n') || u === 'false' || u === '0') validUpdates.has_udyam = 'N';
      }
      if (validUpdates.gstin && !validUpdates.has_gstin) {
        validUpdates.has_gstin = 'Y';
      }
      if (validUpdates.udyam_number && !validUpdates.has_udyam) {
        validUpdates.has_udyam = 'Y';
      }

      return {
        extracted: validUpdates,
        raw: rawResponse,
        prompt: fullPromptLog
      };
    } catch (err) {
      console.error('SchemaExtractionAgent error:', err.message);
      return { extracted: {}, raw: String(err), prompt: fullPromptLog };
    }
  }

  /**
   * Shorthand extract returning just the extracted updates dictionary.
   */
  async extract(currentSchema, latestMessage, conversationHistory) {
    const { extracted } = await this.extractWithMeta(currentSchema, latestMessage, conversationHistory);
    return extracted;
  }
}

const defaultExtractor = new SchemaExtractionAgent();

module.exports = {
  SchemaExtractionAgent,
  schemaExtractor: defaultExtractor,
  SYSTEM_EXTRACTION_PROMPT
};
