/**
 * ============================================================================
 * DATA MODEL: Customer Discovery Schema (customerSchema.js)
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * Defines the single source of truth data structure representing a customer's business profile.
 * As the customer converses with the AI, newly discovered facts are extracted and merged into
 * this schema.
 * 
 * KEY FIELDS TRACKED:
 * - business_name           : Name of the business (e.g., "Sri Lakshmi Sweets")
 * - business_type           : Specific trade/type (e.g., "Bakery", "Dental Clinic", "Textile Unit")
 * - target_segment          : Canonical segment ("Micro Retail & Services", "Professional Offices", etc.)
 * - employee_count          : Headcount of staff/employees
 * - num_sites               : Number of branches or physical locations
 * - city, state, city_tier  : Geographical location and network tier (1 or 2)
 * - preferred_language      : Language spoken by customer (English, Hindi, Telugu, Tamil, etc.)
 * - current_provider        : Incumbent telecom provider (e.g. Jio, BSNL, ACT)
 * - monthly_telecom_spend_inr: Current monthly spend on internet and SIMs
 * - overall_budget          : Total allocated budget
 * - needs                   : Array of desired services (e.g. ["WiFi", "CCTV", "POS"])
 * - max_installation_days  : Maximum acceptable days for installation to complete
 * - has_gstin, gstin        : GSTIN registration status ("Y" / "N") and 15-character identifier
 * - has_udyam, udyam_number : MSME Udyam registration status ("Y" / "N") and registration ID
 * 
 * CORE METHODS:
 * - mergeUpdates(updates)   : Safely applies new extractions without overwriting existing facts with nulls
 * - toJSON()                : Serializes the schema into a standard JSON payload
 * ============================================================================
 */

class CustomerSchema {
  constructor(initial = {}) {
    this.business_name = initial.business_name || null;
    this.business_type = initial.business_type || null;
    this.employee_count = this._coerceInt(initial.employee_count);
    this.num_sites = this._coerceInt(initial.num_sites);
    this.annual_turnover_band = initial.annual_turnover_band || null;
    this.city = initial.city || null;
    this.state = initial.state || null;
    this.city_tier = this._coerceInt(initial.city_tier);
    this.preferred_language = initial.preferred_language || null;
    this.current_provider = initial.current_provider || null;
    this.current_internet = initial.current_internet || null;
    this.monthly_telecom_spend_inr = this._coerceInt(initial.monthly_telecom_spend_inr);
    this.overall_budget = this._coerceInt(initial.overall_budget);
    
    // Coerce fallback budget if monthly telecom spend was not explicitly distinguished
    const rawBudget = this._coerceInt(initial.budget);
    if (this.monthly_telecom_spend_inr === null && rawBudget !== null) {
      this.monthly_telecom_spend_inr = rawBudget;
    }
    this.budget = this.overall_budget !== null ? this.overall_budget : this.monthly_telecom_spend_inr;
    
    this.needs = this._ensureNeedsList(initial.needs);
    this.pain_points = initial.pain_points || null;
    this.future_expansion = initial.future_expansion || null;
    this.installation_urgency = initial.installation_urgency || null;
    this.has_gstin = initial.has_gstin || null;
    this.gstin = initial.gstin || null;
    this.has_udyam = initial.has_udyam || null;
    this.udyam_number = initial.udyam_number || null;
    this.target_segment = initial.target_segment || null;
    this.max_installation_days = this._coerceInt(initial.max_installation_days);
    this.contact_name = initial.contact_name || null;
    this.contact_role = initial.contact_role || null;
  }

  /**
   * Helper: Parses numbers from dirty strings (e.g. "₹4500 per month" -> 4500)
   * @private
   */
  _coerceInt(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return Math.floor(val);
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^\d]/g, '');
      if (cleaned) {
        const parsed = parseInt(cleaned, 10);
        return isNaN(parsed) ? null : parsed;
      }
    }
    return null;
  }

  /**
   * Helper: Standardizes needs into an array of trimmed strings
   * @private
   */
  _ensureNeedsList(val) {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map(x => String(x).trim()).filter(Boolean);
    }
    if (typeof val === 'string') {
      return val.replace(/;/g, ',').split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Merges newly extracted customer facts into the existing profile.
   * Preserves previously known facts if the new payload does not mention them.
   * @param {Object} updates - Facts extracted by SchemaExtractionAgent
   * @returns {CustomerSchema} this instance
   */
  mergeUpdates(updates = {}) {
    for (const [key, val] of Object.entries(updates)) {
      if (!Object.prototype.hasOwnProperty.call(this, key)) continue;
      if (val === null || val === undefined || val === '') continue;

      // Handle array merging for needs
      if (key === 'needs') {
        const incoming = this._ensureNeedsList(val);
        const combined = Array.from(new Set([...this.needs, ...incoming]));
        this.needs = combined;
        continue;
      }

      // Handle numeric coercion
      if (['employee_count', 'num_sites', 'monthly_telecom_spend_inr', 'overall_budget', 'budget', 'city_tier', 'max_installation_days'].includes(key)) {
        const numVal = this._coerceInt(val);
        if (numVal !== null) {
          this[key] = numVal;
          if (key === 'overall_budget') this.budget = numVal;
          if (key === 'monthly_telecom_spend_inr' && this.overall_budget === null) this.budget = numVal;
          if (key === 'budget' && this.overall_budget === null && this.monthly_telecom_spend_inr === null) {
            this.overall_budget = numVal;
          }
        }
        continue;
      }

      // Update string/boolean fields only if incoming value is non-empty
      const currentVal = this[key];
      if (currentVal === null || currentVal === '' || (typeof val === 'string' && val.trim() !== '')) {
        this[key] = val;
      }
    }
    return this;
  }

  /**
   * Serializes the customer schema into a pure JSON-serializable object.
   * @returns {Object} Clean schema state
   */
  toJSON() {
    return {
      business_name: this.business_name,
      business_type: this.business_type,
      target_segment: this.target_segment,
      employee_count: this.employee_count,
      num_sites: this.num_sites,
      annual_turnover_band: this.annual_turnover_band,
      city: this.city,
      state: this.state,
      city_tier: this.city_tier,
      preferred_language: this.preferred_language,
      current_provider: this.current_provider,
      current_internet: this.current_internet,
      monthly_telecom_spend_inr: this.monthly_telecom_spend_inr,
      overall_budget: this.overall_budget,
      budget: this.budget,
      needs: this.needs,
      pain_points: this.pain_points,
      future_expansion: this.future_expansion,
      installation_urgency: this.installation_urgency,
      max_installation_days: this.max_installation_days,
      has_gstin: this.has_gstin,
      gstin: this.gstin,
      has_udyam: this.has_udyam,
      udyam_number: this.udyam_number,
      contact_name: this.contact_name,
      contact_role: this.contact_role,
    };
  }
}

module.exports = CustomerSchema;
