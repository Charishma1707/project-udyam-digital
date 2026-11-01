# Project Udyam Digital - Accel YTL Hackathon 2026

## 1. Problem Context & Overview
**Operator:** Accel Telecom / Accel Business (B2B arm)  
**Target Audience:** India's 6 crore+ micro, small, and medium enterprises (MSMEs):
- Micro retail & services (55%): Kirana stores, salons, pharmacies, bakeries
- Professional offices (25%): Clinics, CA firms, coaching centres
- Small multi-site businesses (15%): Restaurant chains, 3–10 store retailers
- Small manufacturers (5%): Auto-parts units, textile workshops

### The Current Funnel Bottlenecks
- **Conversion Rate:** Only 7.4% of SMB leads activate (5,000 leads → 368 activations).
- **Steepest Drop:** Needs assessed (1,974) to Quote accepted (861) — a 56% drop-off.
- **Cycle Time:** Average of 17.6 days from initial lead to activation.
- **Customer Friction:** 3× follow-up chase calls per customer inquiring about order status.
- **Acquisition Cost:** High blended customer acquisition cost (₹15,000 per activated customer).
- **GST Impact:** Leads with a valid GSTIN convert at 9.6% vs. 2.0% without GSTIN.

---

## 2. Core Solution Modules to Build

### A. GenAI Conversational Advisor (Voice & Chat)
- Conversational discovery in **Hindi, Telugu, Tamil, and other regional Indic languages**.
- Dynamically extracts lead attributes (schema derived from `smb_leads.csv`).
- Identifies missing information and prompts the user conversationally.
- Evaluates rules from `product_catalogue.csv` to recommend the right bundle with a transparent monthly price.

### B. Quote & Transparent Checkout
- Single monthly bill with togglable add-ons (Broadband, SIMs, Cloud CCTV, Static IP, Cloud POS).
- Automated eligibility checks: city tier, minimum employee count, minimum sites, and GSTIN requirements.

### C. Smart Digital KYC & Verification
- Document processing for 12 applicant scenarios (`kyc_documents/`): GST certificate, Udyam certificate, signatory ID, utility address proof.
- Mocked registry lookups backed by `mock_gstin_registry.csv` and `mock_udyam_registry.csv`.
- **DPDP Act, 2023 Compliance:** Explicit consent notice, purpose limitation, data minimization, and masked identifiers in logs and UI.

### D. Order Tracker & Voice Follow-Up
- Real-time milestone tracker (Order Placed → KYC Verified → Feasibility Checked → Dispatched → Installed → Activated).
- Automated voice notifications via **Sarvam Text-to-Speech (`bulbul:v3`)** to eliminate manual status chasing.

---

## 3. Dataset Guide (`YTL_TrackA_Udyam_Digital_Data/`)

| File | Rows / Size | Purpose in System |
| :--- | :--- | :--- |
| `product_catalogue.csv` | 25 products | Product rules, pricing, setup fees, eligibility, and bundle dependencies |
| `smb_leads.csv` | 5,000 leads | Historical lead profiles, funnel stages reached, drop reasons, NPS, and churn |
| `mock_gstin_registry.csv` | 3,534 records | Backend database for real-time GSTIN lookup API |
| `mock_udyam_registry.csv` | 2,723 records | Backend database for real-time Udyam registration lookup API |
| `kyc_documents/` | 47 images | Specimen documents for applicants K01–K12 (some with intentional flaws to detect) |

---

## 4. Discovery Schema (`SMBLeadProfile`)
Extracted from `smb_leads.csv` for conversational needs discovery:
1. `contact_name` & `contact_role` (Decision maker)
2. `business_name` & `business_type` (Kirana, Clinic, Salon, Restaurant, etc.)
3. `segment` (Micro retail, Professional offices, Multi-site, Manufacturer)
4. `city`, `city_tier`, `state`
5. `preferred_language` (Telugu, Hindi, Tamil, English, etc.)
6. `employee_count` & `num_sites`
7. `annual_turnover_band` (< 40L, 40L-1.5Cr, 1.5-5Cr, etc.)
8. `has_gstin` & `gstin` string
9. `has_udyam` & `udyam_number`
10. `current_internet`, `current_provider`, `monthly_telecom_spend_inr`
11. `products_of_interest` (Wi-Fi, CCTV, POS, Business SIMs)

---

## 5. Technology Stack & AI Integration
- **Backend:** Python (FastAPI / Uvicorn)
- **AI Platform:** Sarvam AI SDK (`sarvamai` + `python-dotenv`)
  - **Speech-to-Text (STT):** `saaras:v3` (Indic speech transcription with auto-language detection)
  - **Conversational LLM:** `sarvam-105b-conversations` (Indic multilingual reasoning & entity extraction)
  - **Text-to-Speech (TTS):** `bulbul:v3` (Natural Indic voice synthesis across Telugu, Hindi, Tamil, Kannada, Marathi, etc.)
- **Security:** API keys read strictly from environment (`.env`).
