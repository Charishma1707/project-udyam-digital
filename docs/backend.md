# Backend Specification for Lovable (`backend.md`)
> **Project:** Airtel Business — Project Udyam Digital  
> **Target Frontend Builder:** [Lovable.dev](https://lovable.dev)  
> **Backend Engine:** Python 3.11 + FastAPI + Pydantic v2  
> **Database:** Neon Serverless PostgreSQL 18.6 (AWS `ap-southeast-1`) & In-Memory High-Speed Cache  
> **AI Services:** Sarvam AI (`sarvam-105b-conversations` LLM & `saaras:v3` Speech-to-Text)  
> **Compliance:** Digital Personal Data Protection (DPDP) Act 2023 (AES-256-GCM, SHA-256, Consent Logs)  

---

## 1. Quick Integration Overview

This backend powers the complete digital journey for Indian MSME enterprises purchasing Airtel Business connectivity and cloud bundles.

### Base URLs
- **Local Development:** `http://localhost:8000`
- **Persistent Cloud Tunnel:** `https://airtel-msme-portal.loca.lt` (or your custom Cloudflare / Localtunnel URL)
- **API Prefix:** All endpoints support `/api/...` prefix with full Cross-Origin Resource Sharing (`CORS: *`).

### Key Capabilities Exposed to Lovable
1. **11-Stage Conversational AI Discovery Pipeline:** Interactive Hindi/English text & voice discovery with real-time extracted schema diffs and single next-best-question planning.
2. **Deterministic Recommendation Engine:** 14-stage bundle generator returning **Primary Best Match** and **Value Saver** bundles, with real-time What-If slider simulations.
3. **Smart Digital KYC Verification:** Automated OCR and multi-tier verification across 12 specimen MSME applicants (`K01` to `K12`), registry validation, and AES-256-GCM vaulting.
4. **Order Lifecycle & Sales Command Center:** 4-stage tracking stepper, SLA contracts, customer counter-offers, admin milestone updates, and two-way NOC messaging.
5. **PostgreSQL Database Explorer:** Live data viewer querying the 25 Airtel products, 5,000 SMB leads, 3,534 GSTIN records, and 2,723 Udyam records.

---

## 2. Complete TypeScript Type Definitions (`src/types/backend.ts`)

Paste this file directly into your Lovable project under `src/types/backend.ts`:

```typescript
// ============================================================================
// CUSTOMER PROFILE & DISCOVERY TYPES
// ============================================================================

export interface CustomerSchema {
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
  has_gstin?: string | null; // "Y" | "N"
  gstin?: string | null;
  has_udyam?: string | null; // "Y" | "N"
  udyam_number?: string | null;
  max_installation_days?: number | null;
}

export interface PipelineStageTrace {
  stage: number;
  name: string;
  status: "SUCCESS" | "SKIPPED" | "WARNING" | "FAILED";
  data: Record<string, any>;
}

export interface SchemaDiffCard {
  field: string;
  previous_value: any;
  new_value: any;
  action: "ADDED" | "UPDATED" | "RETAINED";
}

export interface ChatResponse {
  reply: string;
  session_id: string;
  customer_schema: CustomerSchema;
  missing_fields: string[];
  completion_percentage: number;
  ready_for_recommendation: boolean;
  pipeline_trace: PipelineStageTrace[];
  schema_diff: SchemaDiffCard[];
  debug_telemetry: {
    latency_ms: number;
    stt_model: string;
    llm_model: string;
    temperature: number;
  };
}

export interface SessionState {
  session_id: string;
  customer_schema: CustomerSchema;
  missing_fields: string[];
  ready_for_recommendation: boolean;
  completion_percentage: number;
  conversation_history: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
  }>;
}

// ============================================================================
// CATALOGUE & RECOMMENDATION TYPES
// ============================================================================

export interface ProductItem {
  product_id: string;
  category: "Connectivity" | "Cloud & Security" | "IoT & M2M" | "Collaboration";
  product_name: string;
  description: string;
  unit: string;
  price_min_inr_per_month: number;
  price_max_inr_per_month: number;
  one_time_setup_inr: number;
  min_contract_months: number;
  available_city_tiers: string;
  min_employees: number;
  min_sites: number;
  requires_gstin: "Y" | "N";
  requires_one_of: string;
  typical_install_days: number;
  target_segments: string;
}

export interface BundleProductQuote {
  product_id: string;
  product_name: string;
  category: string;
  quantity: number;
  unit_price: number;
  monthly_total: number;
  setup_inr: number;
  contract_months: number;
  install_days: number;
}

export interface SolutionBundle {
  bundle_code: "BUNDLE-PRIMARY" | "BUNDLE-SAVER" | string;
  bundle_name: string;
  tagline: string;
  type: "PRIMARY_BEST_MATCH" | "VALUE_SAVER";
  score: number; // 0 to 100
  monthly_total_inr: number;
  setup_total_inr: number;
  contract_months: number;
  estimated_install_days: number;
  products: BundleProductQuote[];
  fit_reasons: string[];
}

export interface RecommendationResponse {
  profile_summary: {
    business_name: string;
    segment: string;
    city: string;
    city_tier: number;
    monthly_budget: number;
    has_gstin: string;
  };
  recommendations: SolutionBundle[];
  what_if_insights?: {
    gstin_unlocks?: string[];
    timeline_unlocks?: string[];
  };
}

// ============================================================================
// SMART KYC TYPES
// ============================================================================

export interface KYCApplicant {
  applicant_id: string; // e.g. "K01", "K02", ... "K12"
  document_count: number;
  slots: string[];
}

export interface KYCIssue {
  code: string;
  tier: "ERROR" | "WARNING" | "INFO";
  field: string;
  message: string;
  detail?: string;
}

export interface KYCVerificationResult {
  applicant_id: string;
  kyc_approved: boolean;
  status: "APPROVED" | "REJECTED" | "MANUAL_REVIEW";
  error_count: number;
  warning_count: number;
  extracted_fields: {
    gstin?: string;
    trade_name?: string;
    legal_name?: string;
    udyam_number?: string;
    enterprise_name?: string;
    pan?: string;
    signatory_name?: string;
    address?: string;
  };
  registry_matches: {
    gstin_found: boolean;
    udyam_found: boolean;
    gstin_active: boolean;
    name_matched: boolean;
  };
  issues: KYCIssue[];
  dpdp_audit: {
    encrypted_payload_hash: string;
    iv_nonce: string;
    retention_days: number;
    consent_recorded: boolean;
  };
}

// ============================================================================
// ORDER LIFECYCLE & SALES OPERATIONS TYPES
// ============================================================================

export interface OrderMilestone {
  stage: "PENDING" | "CONFIRMED" | "PACKED" | "DELIVERED";
  title: string;
  description: string;
  date_str: string;
  completed: boolean;
  icon: "pending" | "confirm" | "packed" | "delivered";
}

export interface ContractTerms {
  sla_uptime: string;
  mttr_hours: number;
  billing_cycle: string;
  notice_period_days: number;
}

export interface CustomerOrder {
  order_id: string;
  session_id: string;
  customer_name: string;
  business_type: string;
  status: "Pending" | "Order Confirm" | "Packed and Processed" | "Delivered & Activated";
  current_stage_index: number; // 0: Pending, 1: Confirm, 2: Packed, 3: Delivered
  bundle_code: string;
  bundle_name: string;
  monthly_cost: number;
  contract_months: number;
  contract_terms: ContractTerms;
  milestones: OrderMilestone[];
  created_at: string;
}

export interface SalesDashboardMetrics {
  total_leads: number;
  active_orders_count: number;
  rejections_count: number;
  total_pipeline_value_inr: number;
  recent_orders: CustomerOrder[];
  recent_rejections: Array<{
    session_id: string;
    bundle_code: string;
    rejection_reason: string;
    customer_feedback: string;
    budget_offered?: number;
    timestamp: string;
  }>;
}

export interface AdminMessage {
  message_id: string;
  session_id: string;
  customer_name: string;
  message: string;
  bundle_code?: string;
  sender: "ADMIN_NOC";
  created_at: string;
}
```

---

## 3. Complete REST API Specification

### 3.1 Conversational Discovery & Voice

#### `POST /api/chat`
Process customer input (English / Hindi / Hinglish) through the 11-stage AI pipeline.
- **Request:**
  ```json
  {
    "message": "We run Balaji Dental Clinic in Jaipur with 15 staff across 2 branches. Budget is Rs 5000/month.",
    "session_id": "cust-session-987"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "reply": "Could you please share your GSTIN number or state whether your business is GST registered?",
    "session_id": "cust-session-987",
    "completion_percentage": 65,
    "ready_for_recommendation": false,
    "missing_fields": ["has_gstin", "max_installation_days"],
    "customer_schema": {
      "business_name": "Balaji Dental Clinic",
      "business_type": "Healthcare & Dental Clinic",
      "segment": "Healthcare & Diagnostics",
      "city": "Jaipur",
      "state": "Rajasthan",
      "city_tier": 2,
      "employee_count": 15,
      "num_sites": 2,
      "overall_budget": 5000.0,
      "needs": ["Broadband Internet", "Multi-branch Interconnect"],
      "has_gstin": null
    },
    "pipeline_trace": [
      { "stage": 1, "name": "Customer Speech", "status": "SKIPPED", "data": { "mode": "text_input" } },
      { "stage": 3, "name": "Speech Cleaner", "status": "SUCCESS", "data": { "cleaned_text": "..." } },
      { "stage": 4, "name": "Language Detector", "status": "SUCCESS", "data": { "language": "en" } },
      { "stage": 5, "name": "Indic LLM Extraction", "status": "SUCCESS", "data": { "extracted_count": 7 } },
      { "stage": 6, "name": "City Tier Mapping", "status": "SUCCESS", "data": { "city": "Jaipur", "tier": 2 } },
      { "stage": 7, "name": "Visual Schema Diff", "status": "SUCCESS", "data": { "changes_detected": 4 } },
      { "stage": 8, "name": "Missing Field Evaluator", "status": "SUCCESS", "data": { "missing": ["has_gstin"] } },
      { "stage": 9, "name": "Next Single Question Planner", "status": "SUCCESS", "data": { "planned_field": "has_gstin" } },
      { "stage": 10, "name": "Current Customer Schema", "status": "SUCCESS", "data": { "ready": false } },
      { "stage": 11, "name": "Ready for Recommendation", "status": "SUCCESS", "data": { "ready": false } }
    ],
    "schema_diff": [
      { "field": "business_name", "previous_value": null, "new_value": "Balaji Dental Clinic", "action": "ADDED" },
      { "field": "city_tier", "previous_value": null, "new_value": 2, "action": "ADDED" },
      { "field": "employee_count", "previous_value": null, "new_value": 15, "action": "ADDED" }
    ],
    "debug_telemetry": { "latency_ms": 142, "stt_model": "saaras:v3", "llm_model": "sarvam-105b-conversations", "temperature": 0.0 }
  }
  ```

#### `POST /api/voice`
Accepts multipart audio blob (`audio/wav`, `audio/webm`, `audio/mp3`) and converts using Sarvam `saaras:v3`.
- **Form Data:**
  - `audio`: File blob
  - `session_id`: string
- **Response:** Identical format to `POST /api/chat`.

#### `GET /api/session/{session_id}`
Returns customer schema, missing fields, and chat history.

#### `POST /api/reset/{session_id}`
Resets customer discovery session to empty state.

---

### 3.2 Product Catalogue & Recommendation Engine

#### `POST /api/recommend`
Generates deterministic Primary & Value Saver solution bundles.
- **Request:**
  ```json
  {
    "schema": {
      "business_name": "Balaji Dental Care",
      "segment": "Healthcare & Diagnostics",
      "city": "Jaipur",
      "city_tier": 2,
      "employee_count": 15,
      "num_sites": 2,
      "overall_budget": 5000.0,
      "has_gstin": "Y",
      "gstin": "08AAAAA0000A1Z5",
      "needs": ["High Speed Internet", "Cloud Backup"]
    }
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "profile_summary": {
      "business_name": "Balaji Dental Care",
      "segment": "Healthcare & Diagnostics",
      "city": "Jaipur",
      "city_tier": 2,
      "monthly_budget": 5000.0,
      "has_gstin": "Y"
    },
    "recommendations": [
      {
        "bundle_code": "BUNDLE-PRIMARY",
        "bundle_name": "Healthcare & Diagnostics Growth Suite",
        "tagline": "Airtel Ultra Fibre 300 Mbps + Secure Cloud Connect + Fixed Voice",
        "type": "PRIMARY_BEST_MATCH",
        "score": 96,
        "monthly_total_inr": 3499.0,
        "setup_total_inr": 1500.0,
        "contract_months": 12,
        "estimated_install_days": 4,
        "fit_reasons": [
          "Covers 15 employees across 2 branch sites with dedicated SLA",
          "Includes 99.5% uptime commercial broadband with free voice channels",
          "Within specified monthly budget of ₹5,000"
        ],
        "products": [
          {
            "product_id": "P01",
            "product_name": "Airtel Ultra Fibre Broadband",
            "category": "Connectivity",
            "quantity": 2,
            "unit_price": 1299.0,
            "monthly_total": 2598.0,
            "setup_inr": 1000.0,
            "contract_months": 12,
            "install_days": 3
          },
          {
            "product_id": "P07",
            "product_name": "Airtel Secure Cloud Backup",
            "category": "Cloud & Security",
            "quantity": 1,
            "unit_price": 901.0,
            "monthly_total": 901.0,
            "setup_inr": 500.0,
            "contract_months": 12,
            "install_days": 2
          }
        ]
      },
      {
        "bundle_code": "BUNDLE-SAVER",
        "bundle_name": "Healthcare Essential Value Bundle",
        "tagline": "Airtel Business Fibre 100 Mbps Essential",
        "type": "VALUE_SAVER",
        "score": 84,
        "monthly_total_inr": 1999.0,
        "setup_total_inr": 1000.0,
        "contract_months": 12,
        "estimated_install_days": 5,
        "fit_reasons": [
          "Lowest total cost of ownership for Tier-2 clinical setups",
          "43% cost reduction while meeting minimum EHR broadband requirements"
        ],
        "products": [...]
      }
    ]
  }
  ```

#### `POST /api/recommend/what-if`
Instant simulation for toggle sliders (e.g. adding GSTIN or changing installation timeline).
- **Request:**
  ```json
  {
    "session_id": "cust-session-987",
    "has_gstin": "Y",
    "max_installation_days": 3
  }
  ```

#### `POST /api/quote/toggle`
Turn specific product on or off in a bundle with automatic dependency closure.
- **Request:**
  ```json
  {
    "bundle": { ... },
    "product_id": "P09",
    "on": true,
    "profile": { ... }
  }
  ```

#### `GET /api/products`
Returns all 25 official Airtel Business catalogue products with full specs.

---

### 3.3 Smart Digital KYC & Compliance

#### `GET /api/kyc/applicants`
Returns list of specimen test applicants (`K01` to `K12`) from the hackathon benchmark dataset.
- **Response `200 OK`:**
  ```json
  {
    "count": 12,
    "applicants": [
      { "applicant_id": "K01", "document_count": 4, "slots": ["gst_cert", "udyam_cert", "id_proof", "utility_bill"] },
      { "applicant_id": "K02", "document_count": 3, "slots": ["gst_cert", "id_proof", "utility_bill"] },
      ...
    ]
  }
  ```

#### `POST /api/kyc/verify-applicant/{applicant_id}`
Triggers instant OCR, cross-check against 3,534 GSTINs and 2,723 Udyam entries, fuzzy name matching, and DPDP vaulting.
- **Example:** `POST /api/kyc/verify-applicant/K01`
- **Response `200 OK`:**
  ```json
  {
    "applicant_id": "K01",
    "kyc_approved": true,
    "status": "APPROVED",
    "error_count": 0,
    "warning_count": 0,
    "extracted_fields": {
      "gstin": "07AAAAA0000A1Z5",
      "trade_name": "Apex Technologies Pvt Ltd",
      "legal_name": "Apex Technologies Private Limited",
      "udyam_number": "UDYAM-DL-00-1234567"
    },
    "registry_matches": {
      "gstin_found": true,
      "gstin_active": true,
      "udyam_found": true,
      "name_matched": true
    },
    "issues": [],
    "dpdp_audit": {
      "encrypted_payload_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "iv_nonce": "9812a3d4f1bc0018",
      "retention_days": 180,
      "consent_recorded": true
    }
  }
  ```

#### `POST /api/kyc/upload`
Upload custom KYC document files directly via multipart/form-data.

#### `POST /api/kyc/consent`
Logs explicit customer consent for DPDP Act 2023 compliance.

#### `GET /api/kyc/records`
Fetches encrypted vault logs stored in Neon Serverless PostgreSQL with masked PII.

---

### 3.4 Order Lifecycle & Sales Operations

#### `POST /api/orders/accept`
Customer accepts quote; generates SLA contract and provisions the 4-milestone order tracker.
- **Request:**
  ```json
  {
    "sessionId": "cust-session-987",
    "bundleCode": "BUNDLE-PRIMARY",
    "bundleName": "Healthcare & Diagnostics Growth Suite",
    "monthlyCost": 3499.0,
    "contractMonths": 12,
    "customerSchema": {
      "business_name": "Balaji Dental Care",
      "business_type": "Healthcare & Dental Clinic"
    }
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "order_id": "S00061",
    "status": "Order Confirm",
    "current_stage_index": 1,
    "sla_terms": {
      "sla_uptime": "99.5% Standard Commercial Uptime SLA",
      "mttr_hours": 8,
      "billing_cycle": "Monthly Advance"
    },
    "tracking_url": "/tracking?order_id=S00061"
  }
  ```

#### `POST /api/orders/reject`
Captures drop reason and customer's counter-offer budget for the sales escalation queue.
- **Request:**
  ```json
  {
    "sessionId": "cust-session-987",
    "bundleCode": "BUNDLE-PRIMARY",
    "rejectionReason": "Price too high",
    "customerFeedback": "Can we do 2,800/month with setup fee waiver?",
    "budgetOffered": 2800.0
  }
  ```

#### `GET /api/orders/{order_id}`
Fetch live order state and milestones.

#### `GET /api/orders`
Returns all active and historical orders.

#### `POST /api/sales/orders/{order_id}/status`
Operations admin advances milestone stage or updates order status.
- **Request:**
  ```json
  {
    "stageIndex": 2,
    "newStatus": "Packed and Processed",
    "escalationNote": "Router dispatched via Bluedart tracking #BLR88219"
  }
  ```

#### `POST /api/admin/messages/send`
Admin pushes a custom response or counter-offer to a customer's session.
- **Request:**
  ```json
  {
    "session_id": "cust-session-987",
    "customer_name": "Balaji Dental Care",
    "message": "We have reviewed your request and approved a 15% discount for 24-month contract at ₹2,850/mo.",
    "bundle_code": "BUNDLE-PRIMARY-SPECIAL"
  }
  ```

#### `GET /api/user/messages/{session_id}`
Customer retrieves real-time messages from Admin NOC.

---

### 3.5 Database Explorer

#### `GET /api/database/status`
Returns connection status to Neon Cloud PostgreSQL cluster and row counts.

#### `GET /api/database/table/{name}`
Query rows from:
- `product_catalogue` (25 products)
- `smb_leads` (historical leads)
- `gstin_registry` (tax verification records)
- `udyam_registry` (MSME registry)
- `bundle_statistics` (popular bundles, conversion rates)
- `product_statistics` (activation & satisfaction metrics)

---

## 4. Screen-by-Screen UI Architecture for Lovable

Lovable can scaffold the frontend into these 10 clean pages:

```
src/
├── pages/
│   ├── Gateway.tsx            // Screen 1: Role Selection Entry (Customer vs Admin vs Database)
│   ├── CustomerHub.tsx        // Screen 2: 3 Big Action Hub (AI Advisor, Catalogue, Track Orders)
│   ├── DocumentKyc.tsx        // Screen 3: Verify Documents (K01-K12 Specimen Selector & Upload)
│   ├── ProductCatalogue.tsx   // Screen 4: View All 25 Products with Category & Segment Filters
│   ├── AiAdvisor.tsx          // Screen 5: Split-Screen Live Chat + 11-Stage Pipeline + Recommendations
│   ├── OrderTracking.tsx      // Screen 6: Live 4-Milestone Order Tracker & SLA Contract Viewer
│   ├── AdminOrders.tsx        // Screen 7: Admin Operations Portal - All Orders Table
│   ├── AdminStatusUpdate.tsx  // Screen 8: Admin Change Order Status & Dispatch Milestones
│   ├── AdminEscalations.tsx   // Screen 9: Admin Escalations & Lost Quotes Counter-Offer Queue
│   └── DatabaseExplorer.tsx   // Screen 10: PostgreSQL Neon Cloud Table Viewer
```

### Visual Guidelines & Branding (Airtel Enterprise Pulse)
- **Primary Brand Color:** Airtel Red (`#E40000` / `rgb(228, 0, 0)`)
- **Dark Accent:** Deep Charcoal (`#111827`)
- **Background:** Crisp White / Slate Tint (`#F8FAFC` to `#FFFFFF`)
- **Accent Badges:** Emerald Green (`#10B981`) for verified badges, Amber (`#F59E0B`) for pending stages.
- **Typography:** Inter, system-ui, sans-serif.

---

## 5. Ready-to-Use TypeScript API Client (`src/lib/api.ts`)

Paste this directly into your Lovable frontend project:

```typescript
// src/lib/api.ts
import {
  ChatResponse,
  CustomerSchema,
  RecommendationResponse,
  KYCVerificationResult,
  CustomerOrder,
  SalesDashboardMetrics,
  ProductItem,
} from "../types/backend";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Discovery & Chat
  sendChatMessage: (message: string, sessionId?: string): Promise<ChatResponse> =>
    request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id: sessionId }),
    }),

  sendVoiceAudio: async (audioBlob: Blob, sessionId?: string): Promise<ChatResponse> => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");
    if (sessionId) formData.append("session_id", sessionId);

    const res = await fetch(`${API_BASE}/api/voice`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Voice STT failed");
    return res.json();
  },

  getSession: (sessionId: string) => request(`/api/session/${sessionId}`),
  resetSession: (sessionId: string) => request(`/api/reset/${sessionId}`, { method: "POST" }),

  // Recommendation Engine
  getRecommendations: (schema: CustomerSchema): Promise<RecommendationResponse> =>
    request("/api/recommend", {
      method: "POST",
      body: JSON.stringify({ schema }),
    }),

  simulateWhatIf: (params: {
    session_id?: string;
    has_gstin?: string;
    max_installation_days?: number;
  }) =>
    request("/api/recommend/what-if", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  // Products Catalogue
  getProducts: (): Promise<{ count: number; products: ProductItem[] }> =>
    request("/api/products"),

  // KYC Verification
  getKycApplicants: () => request<{ count: number; applicants: any[] }>("/api/kyc/applicants"),
  verifyApplicant: (applicantId: string): Promise<KYCVerificationResult> =>
    request(`/api/kyc/verify-applicant/${applicantId}`, { method: "POST" }),

  // Order Lifecycle
  acceptQuote: (orderData: {
    sessionId: string;
    bundleCode: string;
    bundleName: string;
    monthlyCost: number;
    contractMonths?: number;
    customerSchema?: CustomerSchema;
  }): Promise<{ order_id: string; status: string; tracking_url: string }> =>
    request("/api/orders/accept", {
      method: "POST",
      body: JSON.stringify(orderData),
    }),

  rejectQuote: (rejectData: {
    sessionId: string;
    bundleCode: string;
    rejectionReason: string;
    customerFeedback?: string;
    budgetOffered?: number;
  }) =>
    request("/api/orders/reject", {
      method: "POST",
      body: JSON.stringify(rejectData),
    }),

  getOrder: (orderId: string): Promise<CustomerOrder> => request(`/api/orders/${orderId}`),
  getAllOrders: (): Promise<{ orders: CustomerOrder[] }> => request("/api/orders"),

  updateOrderStatus: (orderId: string, stageIndex: number, newStatus: string, escalationNote?: string) =>
    request(`/api/sales/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify({ stageIndex, newStatus, escalationNote }),
    }),

  // Admin NOC Messaging
  sendAdminMessage: (sessionId: string, customerName: string, message: string, bundleCode?: string) =>
    request("/api/admin/messages/send", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, customer_name: customerName, message, bundle_code: bundleCode }),
    }),

  getUserMessages: (sessionId: string) => request(`/api/user/messages/${sessionId}`),

  // Database Explorer
  getDatabaseStatus: () => request("/api/database/status"),
  getTableRows: (tableName: string) => request(`/api/database/table/${tableName}`),
};
```

---

## 6. Neon Cloud PostgreSQL DDL (Database Schema)

If you configure Supabase or Neon Cloud inside Lovable, execute this migration script:

```sql
-- 1. Encrypted KYC Vault (DPDP Act 2023 Compliant)
CREATE TABLE IF NOT EXISTS kyc_records (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL,
    applicant_id VARCHAR(64),
    doc_type VARCHAR(64) NOT NULL,
    masked_identifier VARCHAR(128) NOT NULL,
    encrypted_payload TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    sha256_hash VARCHAR(128) NOT NULL,
    verification_status VARCHAR(32) NOT NULL,
    registry_matched INTEGER DEFAULT 1,
    tamper_detected INTEGER DEFAULT 0,
    dpdp_consent_logged INTEGER DEFAULT 1,
    metadata_json TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. DPDP Customer Consent Ledger
CREATE TABLE IF NOT EXISTS dpdp_consent_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    purpose VARCHAR(128) NOT NULL,
    language VARCHAR(16) DEFAULT 'en',
    status VARCHAR(32) DEFAULT 'GRANTED',
    dpdp_compliant INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customer Orders and Milestone States
CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(255),
    status VARCHAR(64) NOT NULL DEFAULT 'Pending',
    current_stage_index INTEGER NOT NULL DEFAULT 0,
    bundle_code VARCHAR(64),
    bundle_name VARCHAR(255),
    monthly_cost NUMERIC(12, 2) NOT NULL,
    contract_months INTEGER DEFAULT 12,
    contract_terms_json TEXT,
    milestones_json TEXT,
    created_at VARCHAR(128) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Admin Operations & NOC Messages
CREATE TABLE IF NOT EXISTS admin_messages (
    message_id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL,
    customer_name VARCHAR(255) DEFAULT 'Customer',
    message TEXT NOT NULL,
    bundle_code VARCHAR(64),
    sender VARCHAR(64) DEFAULT 'ADMIN_NOC',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. How to Use with Lovable.dev

1. **Copy this file (`backend.md`)**: Provide this file to Lovable by placing it in your repository or pasting it into the Lovable project knowledge prompt.
2. **Set Environment Variable in Lovable**:
   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   # Or for cloud deployments:
   VITE_API_BASE_URL=https://airtel-msme-portal.loca.lt
   ```
3. **Prompt Lovable**:
   > *"Build the Airtel Business Customer Discovery & Smart KYC Portal based on `backend.md`. Use Tailwind CSS with Airtel Red (`#E40000`) accents, Lucide icons, and the typed API client in `src/lib/api.ts` connecting to the 10 core screens."*

