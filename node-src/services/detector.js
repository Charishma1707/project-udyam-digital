/**
 * ============================================================================
 * SERVICE: Missing Information Detector (detector.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Evaluates the current CustomerSchema against the list of required onboarding fields.
 * Reports which fields are still missing and calculates the profile completion percentage (0% to 100%).
 * 
 * CRITICAL ARCHITECTURAL RULE (Strictly NO AI):
 * This service is 100% deterministic code.
 * It contains NO LLM calls, ensuring fast, predictable, and explainable decision-making.
 * 
 * REQUIRED FIELDS FOR 100% DISCOVERY ONBOARDING:
 * 1. business_type             : Identifies trade/industry
 * 2. employee_count            : Headcount determines bandwidth & SIM requirements
 * 3. num_sites                 : Locations determine single-site fibre vs multi-site SD-WAN
 * 4. city                      : Location verifies city tier eligibility
 * 5. needs                     : Required product categories (WiFi, CCTV, SIMs, POS)
 * 6. monthly_telecom_spend_inr : Monthly spend evaluated for ROI and package fit
 * 7. has_gstin                 : GST status determines tax credit and enterprise product eligibility
 * 8. has_udyam                 : MSME registration unlocks priority benefits and tariffs
 * 9. max_installation_days     : Timeline determines wireless vs physical fibre deployment
 * 
 * HOW TO USE:
 * const { MissingInformationDetector } = require('./detector');
 * const { missing_fields, schema_complete } = MissingInformationDetector.detect(schema);
 * const completionPct = MissingInformationDetector.calculateCompletionPercentage(schema);
 * ============================================================================
 */

// Canonical list of required fields to reach 100% completed onboarding
const REQUIRED_FIELDS = [
  'business_type',
  'employee_count',
  'num_sites',
  'city',
  'needs',
  'monthly_telecom_spend_inr',
  'has_gstin',
  'has_udyam',
  'max_installation_days'
];

class MissingInformationDetector {
  /**
   * Deterministic Missing Information Detector.
   * Inspects each required field and checks whether it has been populated with valid data.
   * 
   * @param {Object} schema - CustomerSchema instance or JSON object
   * @param {string[]} [requiredFields=REQUIRED_FIELDS] - Optional custom list of fields
   * @returns {{ missing_fields: string[], schema_complete: boolean }}
   */
  static detect(schema, requiredFields = REQUIRED_FIELDS) {
    const missing = [];

    for (const field of requiredFields) {
      const val = schema[field];

      // 1. Needs must be a non-empty array
      if (field === 'needs') {
        if (!val || !Array.isArray(val) || val.length === 0) {
          missing.push(field);
        }
        continue;
      }

      // 2. Budget is satisfied by either monthly telecom spend OR overall budget
      if (field === 'monthly_telecom_spend_inr') {
        const telecom = schema.monthly_telecom_spend_inr;
        const overall = schema.overall_budget || schema.budget;
        const hasValidTelecom = typeof telecom === 'number' && telecom > 0;
        const hasValidOverall = typeof overall === 'number' && overall > 0;
        if (!hasValidTelecom && !hasValidOverall) {
          missing.push('monthly_telecom_spend_inr');
        }
        continue;
      }

      // 3. Headcount, site count, and installation days must be positive integers
      if (['employee_count', 'num_sites', 'max_installation_days'].includes(field)) {
        if (val === null || val === undefined || typeof val !== 'number' || val <= 0) {
          missing.push(field);
        }
        continue;
      }

      // 4. GSTIN status is satisfied if has_gstin ('Y'/'N') or a gstin string is present
      if (field === 'has_gstin') {
        const gVal = schema.has_gstin || schema.gstin;
        if (gVal === null || gVal === undefined || (typeof gVal === 'string' && !gVal.trim())) {
          missing.push('has_gstin');
        }
        continue;
      }

      // 5. Udyam status is satisfied if has_udyam ('Y'/'N') or a udyam_number string is present
      if (field === 'has_udyam') {
        const uVal = schema.has_udyam || schema.udyam_number;
        if (uVal === null || uVal === undefined || (typeof uVal === 'string' && !uVal.trim())) {
          missing.push('has_udyam');
        }
        continue;
      }

      // 6. Generic string field check
      if (val === null || val === undefined || (typeof val === 'string' && !val.trim())) {
        missing.push(field);
      }
    }

    return {
      missing_fields: missing,
      schema_complete: missing.length === 0
    };
  }

  /**
   * Calculates the completion percentage from 0 to 100.
   * @param {Object} schema - CustomerSchema instance
   * @returns {number} Completion integer percentage
   */
  static calculateCompletionPercentage(schema) {
    const res = this.detect(schema);
    const total = REQUIRED_FIELDS.length;
    const completed = total - res.missing_fields.length;
    return Math.floor((completed / total) * 100);
  }
}

module.exports = {
  REQUIRED_FIELDS,
  MissingInformationDetector
};
