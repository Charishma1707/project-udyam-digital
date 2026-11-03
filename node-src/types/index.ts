/**
 * ============================================================================
 * AIRTEL BUSINESS - TYPESCRIPT TYPE DEFINITIONS
 * Domain Entities, Schema Contracts, and Service Interfaces
 * ============================================================================
 */

export interface ICustomerSchema {
  lead_id?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  business_type?: string | null;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  city_tier?: number | null;
  preferred_language?: string | null;
  employee_count?: number | null;
  num_sites?: number | null;
  annual_turnover_band?: string | null;
  current_internet?: string | null;
  current_provider?: string | null;
  monthly_telecom_spend_inr?: number | null;
  overall_budget?: number | null;
  needs: string[];
  has_gstin?: 'Y' | 'N' | null;
  gstin?: string | null;
  has_udyam?: 'Y' | 'N' | null;
  udyam_number?: string | null;
  max_installation_days?: number | null;
}

export interface IProduct {
  product_id: string;
  product_name: string;
  category: string;
  speed_mbps?: number | null;
  monthly_price_inr: number;
  one_time_setup_inr: number;
  contract_months: number;
  min_employees: number;
  min_sites: number;
  requires_gstin: 'Y' | 'N';
  available_city_tiers: string;
  typical_install_days: number;
  requires_one_of?: string | null;
  popular_with_segments?: string;
}

export interface IBundleRecommendation {
  bundle_code: string;
  bundle_name: string;
  tagline: string;
  type: 'PRIMARY_BEST_MATCH' | 'VALUE_SAVER' | 'FAST_TRACK';
  score: number;
  monthly_total_inr: number;
  setup_total_inr: number;
  contract_months: number;
  estimated_install_days: number;
  products: IProduct[];
  fit_reasons: string[];
  nps_boost_applied: boolean;
  savings_vs_individual_inr: number;
}

export interface IWhatIfInsight {
  type: 'GSTIN_UNLOCK' | 'TIMELINE_ADJUSTMENT' | 'BUDGET_OPTIMIZATION';
  title: string;
  description: string;
  potential_unlocks: string[];
  potential_tax_benefit_inr?: number;
}

export interface IRecommendationResponse {
  customer_segment: string;
  city_tier: number;
  eligible_products_count: number;
  total_products_count: number;
  bundles: IBundleRecommendation[];
  what_if_insights: IWhatIfInsight[];
}

export interface IMissingInformationResult {
  missing_fields: string[];
  schema_complete: boolean;
  completion_percentage: number;
  field_count: {
    total: number;
    collected: number;
    missing: number;
  };
}

export interface IPlannerResult {
  next_field: string | null;
  reason: string;
  canonical_question: string;
  is_complete: boolean;
}

export interface IPipelineTrace {
  stage: number;
  name: string;
  status: 'PENDING' | 'SUCCESS' | 'SKIPPED' | 'FAILED';
  duration_ms?: number;
  data: Record<string, any>;
}

export interface IConversationResult {
  reply: string;
  audio_url?: string | null;
  session_id: string;
  customer_schema: ICustomerSchema;
  missing_fields: string[];
  completion_percentage: number;
  ready_for_recommendation: boolean;
  pipeline_trace: IPipelineTrace[];
  schema_diff?: Record<string, { previous: any; current: any }>;
  debug_telemetry?: {
    latency_ms: number;
    stt_model: string;
    llm_model: string;
    temperature: number;
  };
}

export interface IKycVerificationResult {
  status: 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';
  doc_type: 'gstin' | 'udyam' | 'signatory_id' | 'address_proof';
  extracted_identifier: string | null;
  extracted_name: string | null;
  extracted_date?: string | null;
  registry_matched: boolean;
  registry_record?: Record<string, any> | null;
  validation_errors: string[];
  tamper_detected: boolean;
  secure_hash: string;
}

export interface IOrderTrackingMilestone {
  stage: string;
  title: string;
  description: string;
  completed: boolean;
  completed_at?: string | null;
  target_days: number;
}

export interface IOrder {
  order_id: string;
  session_id: string;
  status: 'QUOTE_ACCEPTED' | 'KYC_PENDING' | 'SURVEY_SCHEDULED' | 'INSTALLATION' | 'ACTIVATED' | 'ESCALATED';
  current_stage_index: number;
  bundle_code: string;
  bundle_name: string;
  monthly_cost: number;
  contract_months: number;
  contract_terms: {
    sla_uptime: string;
    mttr_hours: number;
    billing_cycle: string;
    notice_period_days: number;
  };
  milestones: IOrderTrackingMilestone[];
  created_at: string;
  updated_at: string;
  escalation_notes?: string[];
}
