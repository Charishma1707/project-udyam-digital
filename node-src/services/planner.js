/**
 * ============================================================================
 * SERVICE: Deterministic Question Planner (planner.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Selects the next single best question to ask the customer based on which discovery
 * fields are currently missing from their profile.
 * 
 * CRITICAL ARCHITECTURAL RULES:
 * 1. Strictly NO AI: Question selection is 100% deterministic code based on predefined priority.
 * 2. ONE Question Rule: The assistant asks ONLY ONE question at a time to prevent overwhelming the user.
 * 3. Never Recommend Products in Phase 1: Only discovery questions are formulated here.
 * 4. Priority Order: Asks high-impact qualification questions (business type, staff size, locations)
 *    before asking about telecom budget, GST registration, Udyam, or installation urgency.
 * 
 * HOW TO USE:
 * const { QuestionPlanner } = require('./planner');
 * const nextPlan = QuestionPlanner.selectNextQuestion(missing_fields);
 * // returns: { field: "city", canonical_question: "Which city is your business located in?", reason: "..." }
 * ============================================================================
 */

// Canonical questions asked for each customer attribute
const QUESTION_MAP = {
  business_type: "What type of business do you run?",
  employee_count: "Approximately how many employees work in your business?",
  num_sites: "How many branches or business locations do you currently operate?",
  city: "Which city is your business located in?",
  needs: "What business services are you looking for today? For example Internet, WiFi, CCTV or Cloud services.",
  monthly_telecom_spend_inr: "What is your approximate monthly telecom spend or telecom budget?",
  has_gstin: "Do you currently have a GST registration (GSTIN) for your business?",
  has_udyam: "Is your business registered under Udyam (MSME)?",
  max_installation_days: "Within how many days do you need the installation completed?",
  overall_budget: "What is your approximate overall monthly budget for these business solutions?",
  budget: "What is your approximate monthly telecom budget?"
};

// Business justifications for why each piece of information is required
const QUESTION_REASON_MAP = {
  business_type: "Business type is essential to identify commercial segment and baseline connectivity profile.",
  employee_count: "Employee headcount determines bandwidth capacity and minimum seat requirements.",
  num_sites: "Number of locations determines whether single-site fibre or multi-site SD-WAN failover is required.",
  city: "City location is required to verify network coverage and city tier eligibility.",
  needs: "Core business needs determine which product categories (Fibre, CCTV, SIMs, POS) must be included.",
  monthly_telecom_spend_inr: "Monthly telecom spend or telecom budget is required to evaluate cost savings and fit suitable communication plans.",
  has_gstin: "GST status determines tax credit eligibility and unlocks enterprise B2B products (e.g. 1G fibre & leased lines).",
  has_udyam: "Udyam registration confirms MSME status and unlocks priority enterprise benefits.",
  max_installation_days: "Installation timeline determines eligibility for plug-and-play wireless versus physical fibre lines.",
  overall_budget: "Overall budget ensures the recommended bundle stays within the customer's total financial capacity.",
  budget: "Budget is required before bundle recommendation to ensure financial viability and appropriate tiering."
};

// Deterministic priority ordering: The AI will ask questions strictly in this sequence
const FIELD_PRIORITY = [
  'business_type',
  'employee_count',
  'num_sites',
  'city',
  'needs',
  'monthly_telecom_spend_inr',
  'has_gstin',
  'has_udyam',
  'max_installation_days',
  'overall_budget',
  'budget'
];

class QuestionPlanner {
  /**
   * Deterministic Question Planner.
   * Selects the highest-priority unanswered field from the missing_fields list.
   * 
   * @param {string[]} missingFields - List of missing field keys from MissingInformationDetector
   * @returns {{ field: string, canonical_question: string, reason: string } | null}
   */
  static selectNextQuestion(missingFields = []) {
    if (!missingFields || missingFields.length === 0) {
      return null;
    }

    // Traverse by highest priority first
    for (const priorityField of FIELD_PRIORITY) {
      if (missingFields.includes(priorityField)) {
        return {
          field: priorityField,
          canonical_question: QUESTION_MAP[priorityField] || `Could you please share your ${priorityField.replace(/_/g, ' ')}?`,
          reason: QUESTION_REASON_MAP[priorityField] || `${priorityField.replace(/_/g, ' ')} is required to complete customer profile.`
        };
      }
    }

    // Fallback: pick the first remaining field
    const firstMissing = missingFields[0];
    return {
      field: firstMissing,
      canonical_question: QUESTION_MAP[firstMissing] || `Could you please share your ${firstMissing.replace(/_/g, ' ')}?`,
      reason: QUESTION_REASON_MAP[firstMissing] || `${firstMissing.replace(/_/g, ' ')} is required to complete customer profile.`
    };
  }
}

module.exports = {
  QUESTION_MAP,
  QUESTION_REASON_MAP,
  FIELD_PRIORITY,
  QuestionPlanner
};
