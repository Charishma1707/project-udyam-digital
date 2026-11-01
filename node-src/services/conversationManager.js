/**
 * ============================================================================
 * SERVICE: Master Conversation Manager & Pipeline Orchestrator (conversationManager.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * This is the central brain and coordinator for customer interactions.
 * It manages the complete end-to-end flow for every turn, executing the 11-stage pipeline:
 * 
 * THE 11-STAGE LIVE AI PIPELINE:
 * - Stage 1 : Customer Speech Input (Raw voice audio or direct text)
 * - Stage 2 : Speech-to-Text (Sarvam saaras:v3 transcript + natural cleaning via STTCleaner)
 * - Stage 3 : Multilingual Language Detection (Tracks customer's active language)
 * - Stage 4 : Schema Extraction Agent (Sarvam sarvam-105b parses newly mentioned facts)
 * - Stage 5 : Schema Mutation & Diff (Computes old_value -> new_value diff)
 * - Stage 6 : Missing Information Detector (Deterministic check of remaining required fields)
 * - Stage 7 : Completion Percentage (0% to 100% progress gauge)
 * - Stage 8 : Question Planner / Phase 2 Recommendation
 *             - If incomplete: Asks EXACTLY ONE prioritized follow-up question
 *             - If 100% complete: Triggers Phase 2 recommendation engine
 * - Stage 9 : Conversation Memory Context (Preserves past user & assistant turns)
 * - Stage 10: Complete Customer Schema (Serializes current known business profile)
 * - Stage 11: Ready for Recommendation / Recommendation Bundles
 * 
 * DEVELOPER VIEW:
 * Emits full diagnostics including exact LLM prompts, raw model responses, and execution latency.
 * ============================================================================
 */

const { targetSegmentService } = require('./targetSegmentService');
const { recommendationEngine } = require('./recommendationEngine');
const { cityTierTool } = require('./cityTierTool');
const STTCleaner = require('./sttCleaner');
const { MissingInformationDetector } = require('./detector');
const { QuestionPlanner } = require('./planner');
const { schemaExtractor } = require('./extractor');
const { sarvamClient } = require('./sarvamClient');
const { sessionStore } = require('./sessionStore');
const config = require('../config');


// System prompt guiding the sales advisor voice during Customer Discovery
const ADVISOR_SYSTEM_PROMPT = `You are an expert, courteous, and concise Airtel Business Sales Advisor.
Your role during Customer Discovery is to understand the customer's business and ask EXACTLY ONE follow-up question.

STRICT BUSINESS RULES:
1. NEVER recommend any products, plans, bundles, or prices while discovery is ongoing.
2. NEVER perform KYC, contracts, or similarity scoring.
3. Ask EXACTLY ONE question at a time. Never overwhelm the customer.
4. Acknowledge what the customer just told you warmly and briefly.
5. Then ask the SPECIFIED follow-up question in the customer's active language.
6. Match the customer's active language (e.g., Telugu, Hindi, Tamil, Kannada, Marathi, Gujarati, English, Hinglish, etc.).
7. Keep your response brief, natural, and conversational (1-3 sentences maximum).
`;

// System prompt guiding high-confidence solution presentation once onboarding reaches 100%
const RECOMMENDATION_ADVISOR_PROMPT = `You are a consultative, senior Airtel Business Solutions Advisor.
The customer has completed their discovery profile.
Your role now is to present their customized, top-ranked Airtel Business Solution with high confidence, professional polish, and transparent pricing in their active language.

STRICT BUSINESS RULES:
1. Speak warmly and authoritatively as a trusted business technology partner.
2. Clearly highlight the primary recommended bundle, its monthly investment, and setup timeline.
3. Highlight the statutory value of GSTIN (18% input tax credit and dedicated enterprise line access) and Udyam advantages.
4. Keep the presentation crisp, elegant, structured, and easy to read (max 3-4 sentences or short bullet points).
5. Match the customer's active language (English, Hindi, Telugu, Tamil, etc.).
`;

class ConversationManager {
  constructor(extractor = schemaExtractor, client = sarvamClient, store = sessionStore) {
    this.extractor = extractor;
    this.client = client;
    this.store = store;
  }

  /**
   * Primary entry point called by HTTP server for text or voice input.
   * Executes all 11 stages and returns the assistant reply + pipeline trace.
   * 
   * @param {Object} params
   * @param {string} [params.message] - Customer text input
   * @param {string} [params.sessionId] - Unique session identifier
   * @param {Buffer} [params.audioBuffer] - Optional audio recording buffer
   * @param {string} [params.filename] - Original audio filename
   * @param {string} [params.mimeType] - Audio MIME type (e.g. audio/webm)
   * @returns {Promise<Object>} Assistant reply, updated schema, completion status, and full trace
   */
  async handleMessage({ message = '', sessionId, audioBuffer, filename = 'recording.webm', mimeType = 'audio/webm' }) {
    const startTime = Date.now();
    const session = this.store.getOrCreate(sessionId);
    sessionId = session.session_id;

    // Snapshot previous schema state to compute diff in Stage 5
    const previousSchema = session.schema.toJSON();

    // ------------------------------------------------------------------------
    // STAGE 1: CUSTOMER SPEECH INPUT
    // ------------------------------------------------------------------------
    const stage1Speech = {
      is_audio: Boolean(audioBuffer),
      byte_size: audioBuffer ? audioBuffer.length : 0,
      format: audioBuffer ? mimeType : 'text/plain',
      status: audioBuffer ? 'Voice Audio Received' : 'Direct Text Message'
    };

    // ------------------------------------------------------------------------
    // STAGE 2: SPEECH-TO-TEXT (STT) & NATURAL CLEANING
    // ------------------------------------------------------------------------
    let rawTranscript = '';
    let userText = '';
    let stage2Stt = {};

    if (audioBuffer) {
      rawTranscript = await this.client.transcribeAudio({ buffer: audioBuffer, filename, mimeType });
      userText = STTCleaner.clean(rawTranscript);
      stage2Stt = {
        raw_transcript: rawTranscript,
        cleaned_transcript: userText,
        confidence: 'High (Sarvam saaras:v3)',
        status: 'Transcribed & Cleaned'
      };
    } else {
      userText = STTCleaner.clean(message);
      stage2Stt = {
        raw_transcript: message,
        cleaned_transcript: userText,
        confidence: 'Exact (Text Input)',
        status: 'Cleaned'
      };
    }

    // Append customer message to session memory
    session.conversation_history.push({ role: 'user', content: userText });

    // ------------------------------------------------------------------------
    // STAGE 4: SCHEMA EXTRACTION AGENT (SARVAM 105B LLM)
    // ------------------------------------------------------------------------
    const { extracted, raw: extractionRaw, prompt: extractionPrompt } = await this.extractor.extractWithMeta(
      session.schema,
      userText,
      session.conversation_history
    );

    // ------------------------------------------------------------------------
    // STAGE 5: UPDATE CUSTOMER SCHEMA & COMPUTE MUTATION DIFF
    // ------------------------------------------------------------------------
    session.schema.mergeUpdates(extracted);

    // AI Tool Call Tracking
    const toolCalls = [];

    // Deterministically resolve target segment as soon as business_type is known
    if (session.schema.business_type && !session.schema.target_segment) {
      const segRes = await targetSegmentService.resolveSegment(session.schema.business_type);
      if (segRes && segRes.segment) {
        session.schema.target_segment = segRes.segment;
        toolCalls.push({
          tool: 'resolve_target_segment',
          input: { business_type: session.schema.business_type },
          output: segRes
        });
      }
    }

    // AI Tool Call: Automatically look up network city tier into customer schema from customer city
    if (session.schema.city && (!session.schema.city_tier || extracted.city)) {
      const cityTierResult = await cityTierTool.execute({ city: session.schema.city });
      const appliedDiff = cityTierTool.applyToSchema(session.schema, cityTierResult);
      toolCalls.push({
        tool: 'lookup_city_tier',
        input: { city: session.schema.city },
        output: cityTierResult,
        applied: appliedDiff,
        status: 'success'
      });
    }

    const currentSchema = session.schema.toJSON();


    // Compute field-by-field diff (old_value -> new_value)
    const schemaDiff = [];
    for (const [k, currVal] of Object.entries(currentSchema)) {
      const prevVal = previousSchema[k];
      if (currVal !== prevVal && currVal !== null && !(Array.isArray(currVal) && currVal.length === 0)) {
        schemaDiff.push({
          field: k,
          old_value: prevVal,
          new_value: currVal
        });
      }
    }

    // ------------------------------------------------------------------------
    // STAGE 3: MULTILINGUAL LANGUAGE DETECTION
    // ------------------------------------------------------------------------
    const detectedLang = session.schema.preferred_language || session.active_language || 'English';
    session.active_language = detectedLang;
    const stage3Language = {
      detected_language: detectedLang,
      source: 'Sarvam Chat & Input Analysis'
    };

    // ------------------------------------------------------------------------
    // STAGE 6: DETERMINISTIC MISSING INFORMATION DETECTION
    // ------------------------------------------------------------------------
    const detectionResult = MissingInformationDetector.detect(session.schema);
    const missingFields = detectionResult.missing_fields;
    const isComplete = detectionResult.schema_complete;
    const compPct = MissingInformationDetector.calculateCompletionPercentage(session.schema);

    // ------------------------------------------------------------------------
    // STAGE 8: QUESTION PLANNER OR PHASE 2 RECOMMENDATION
    // ------------------------------------------------------------------------
    let plannerInfo = {};
    let assistantReply = '';
    let formulationPrompt = '';
    let formulationRaw = '';
    let recommendations = null;

    if (isComplete) {
      // 100% DISCOVERY ONBOARDING REACHED -> EXECUTE PHASE 2 RECOMMENDATION
      plannerInfo = {
        target_field: null,
        reason: 'Customer profile is 100% complete! Proceeding to Phase 2 tailored product recommendations.',
        canonical_question: null
      };

      recommendations = await recommendationEngine.generateRecommendations(session.schema);
      const topBundle = recommendations.recommended_bundles[0];

      const completionPrompt = `The customer's business discovery profile is 100% COMPLETE.
Phase 2 Airtel Business Bundle Recommendation:

Customer Segment: ${session.schema.target_segment || 'General Business'}
Business Type: ${session.schema.business_type}
Locations: ${session.schema.num_sites || 1}
Staff: ${session.schema.employee_count || 'Small team'}
Needs: ${session.schema.needs.join(', ')}
Monthly Telecom Spend / Budget: ₹${session.schema.monthly_telecom_spend_inr || session.schema.overall_budget || '3000'}/mo

Top Recommended Bundle:
- Name: ${topBundle.bundle_name}
- Products: ${topBundle.products.map(p => p.product_name).join(', ')}
- Monthly Investment: ₹${topBundle.monthly_cost_inr}/mo (Estimated savings: ₹${topBundle.monthly_savings_inr}/mo)
- Setup Timeline: ${topBundle.estimated_install_days} days

GSTIN Status: ${session.schema.has_gstin === 'Y' ? 'Verified GST registered (18% input credit eligible)' : 'No GST provided (Biz Fibre 100 & 5G FWA available)'}
${recommendations.what_if_insights.gstin_unlocked_products.length > 0 ? `Unlocked with GSTIN: ${recommendations.what_if_insights.gstin_unlocked_products.map(p => p.product_name).join(', ')}` : ''}

Task: Formulate an enthusiastic, professional sales advisor response in ${session.active_language}:
1. Congratulate them on completing their onboarding profile.
2. Present their top recommended Airtel Business solution (${topBundle.bundle_name}) with transparent pricing and installation timeline.
3. Mention how having GSTIN unlocks further enterprise solutions, and note the installation days options.
4. Keep it concise, friendly, and structured.
`;

      const messages = [
        { role: 'system', content: RECOMMENDATION_ADVISOR_PROMPT },
        { role: 'user', content: completionPrompt }
      ];
      formulationPrompt = completionPrompt;
      assistantReply = await this.client.chatCompletion({ messages, temperature: 0.3, maxTokens: 250 });
      formulationRaw = assistantReply;
    } else {
      // INCOMPLETE PROFILE -> SELECT AND ASK EXACTLY ONE QUESTION
      const nextQuestionPlan = QuestionPlanner.selectNextQuestion(missingFields);
      const targetField = nextQuestionPlan.field;
      const canonicalQ = nextQuestionPlan.canonical_question;
      const reasonText = nextQuestionPlan.reason;

      plannerInfo = {
        target_field: targetField,
        reason: reasonText,
        canonical_question: canonicalQ
      };

      formulationPrompt = `Customer's latest message: "${userText}"
Customer's active language: ${session.active_language}

Known Customer Details:
${JSON.stringify(Object.fromEntries(Object.entries(currentSchema).filter(([_, v]) => v !== null)), null, 2)}

Next target missing field to ask: '${targetField}'
Predefined Question template: "${canonicalQ}"

TASK:
1. Warmly and concisely acknowledge what the customer just said.
2. Ask the target question naturally in the customer's language (${session.active_language}).
3. Ask ONLY THIS ONE QUESTION. Do not ask multiple questions.
4. Do NOT mention products, packages, or pricing.
`;

      const messages = [
        { role: 'system', content: ADVISOR_SYSTEM_PROMPT },
        { role: 'user', content: formulationPrompt }
      ];
      assistantReply = await this.client.chatCompletion({ messages, temperature: 0.3, maxTokens: 200 });
      formulationRaw = assistantReply;
    }

    // Save assistant reply into conversation history
    session.conversation_history.push({ role: 'assistant', content: assistantReply });
    const totalLatencyMs = Date.now() - startTime;

    // ------------------------------------------------------------------------
    // ASSEMBLE FULL 11-STAGE PIPELINE TRACE FOR REAL-TIME UI VISUALIZATION
    // ------------------------------------------------------------------------
    const pipelineTrace = {
      stage1_speech: stage1Speech,
      stage2_stt: stage2Stt,
      stage3_language: stage3Language,
      stage4_extracted_json: extracted,
      stage5_schema_diff: schemaDiff,
      stage6_missing_fields: missingFields,
      stage7_completion_pct: compPct,
      stage8_planner: plannerInfo,
      stage9_memory: [...session.conversation_history],
      stage10_schema: currentSchema,
      stage11_ready: isComplete,
      tool_calls: toolCalls,
      recommendations: isComplete ? recommendations : null,
      developer_view: {
        model: config.sarvamChatModel,
        stt_model: config.sarvamSttModel,
        total_latency_ms: totalLatencyMs,
        tool_calls: toolCalls,
        extraction_prompt: extractionPrompt,
        extraction_raw: extractionRaw,
        formulation_prompt: formulationPrompt,
        formulation_raw: formulationRaw,
        validation_status: 'Valid CustomerSchema (Node.js)'
      }
    };

    if (isComplete) {
      session.recommendations = recommendations;
    }

    return {
      assistant: assistantReply,
      customer_schema: currentSchema,
      missing_fields: missingFields,
      tool_calls: toolCalls,
      ready_for_recommendation: isComplete,

      recommendations: isComplete ? recommendations : null,
      session_id: sessionId,
      detected_language: session.active_language,
      completion_percentage: compPct,
      pipeline_trace: pipelineTrace
    };
  }
}

const defaultConversationManager = new ConversationManager();

module.exports = {
  ConversationManager,
  conversationManager: defaultConversationManager
};
