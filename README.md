# Airtel Business — Project Udyam Digital
### Enterprise Conversational AI Advisor, 11-Stage Pipeline Visualizer & Smart Digital KYC Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%2B-blue.svg)](tsconfig.json)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-41%2F41%20Passed-brightgreen.svg)](node-tests/)
[![Docker](https://img.shields.io/badge/Docker-PostgreSQL%2016-blue.svg)](docker-compose.yml)
[![Sarvam AI](https://img.shields.io/badge/AI%20Engine-Sarvam%20Indic%20105B-orange.svg)](https://www.sarvam.ai/)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%20Act%202023-purple.svg)](#security--dpdp-act-2023-compliance)

---

## Executive Summary

Built for the **Accel YTL Hackathon (Track A)**, **Project Udyam Digital** is an enterprise-grade AI sales platform for **Airtel Business (B2B)** designed to serve India's 6+ crore Micro, Small, and Medium Enterprises (MSMEs). 

It tackles key telecom lead conversion friction points—long 17.6-day activation lead times, 56% post-needs-assessment drop-offs, and manual follow-ups—through an end-to-end autonomous customer journey:

```
[Voice / Text Chat in Indic Languages]
               │
               ▼
[11-Stage AI Discovery & Extraction] ──► [Deterministic Missing Field Planner]
               │
               ▼
[Hard Filtering & Bundle Recommendation] ──► [Top 2 Bundles + What-If Unlocks]
               │
               ▼
[Smart Digital KYC & OCR Engine] ──► [AES-256-GCM + Zero-Residue Memory Purge]
               │
               ▼
[Quote Acceptance & Dynamic SLA Contract] ──► [5-Milestone Order Tracker & Escalations]
```

---

## Key Modules & Capabilities

| Module | Core Features | Core Implementation |
| :--- | :--- | :--- |
| **Phase 1: Conversational Discovery** | Real-time speech & text, Indic language detection (Hindi, Telugu, Tamil, English, Hinglish), zero-hallucination schema extraction (`temperature: 0.0`), deterministic missing field prioritization. | [`extractor.js`](file:///node-src/services/extractor.js), [`planner.js`](file:///node-src/services/planner.js), [`detector.js`](file:///node-src/services/detector.js) |
| **Live AI Pipeline Visualizer** | Split-screen debugging UI displaying 11 discrete stages in real-time with visual diff cards, developer telemetry, latency benchmarks, and raw prompts. | [`frontend/app.jsx`](file:///frontend/app.jsx), [`conversationManager.js`](file:///node-src/services/conversationManager.js) |
| **Phase 2: Recommendation Engine** | Strict eligibility checks (Tier 1 vs 2, headcount, GSTIN lock), tailored Primary & Value-Saver bundles, mathematical scoring formula, What-If unlock recommendations. | [`recommendationEngine.js`](file:///node-src/services/recommendationEngine.js), [`targetSegmentService.js`](file:///node-src/services/targetSegmentService.js) |
| **Phase 3: Smart Digital KYC** | Multi-document OCR (GSTIN, Udyam, Aadhaar, Signatory IDs), image enhancement & rotation correction, active mock registry cross-referencing, automated document status checks. | [`ocrService.js`](file:///node-src/services/ocrService.js), [`imagePreprocessor.js`](file:///node-src/services/imagePreprocessor.js) |
| **Security & DPDP Compliance** | AES-256-GCM authenticated encryption for stored credentials, RAM buffer zero-residue purging (`securePurgeBuffer()`), public PII masking, SHA-256 deduplication. | [`secureVault.js`](file:///node-src/services/secureVault.js) |
| **Phase 4 & 5: Orders & Drop Analytics** | Instant quote acceptance, KYC enforcement gating, dynamic SLA contracts, 5-milestone order tracker with countdowns, structured drop reason capture & counter-offers. | [`orderService.js`](file:///node-src/services/orderService.js) |
| **Phase 6: Sales Command Center** | Dual-view agent portal, KPI tracking, live escalation queue, order status editor, lost quote analysis log. | [`frontend/app.jsx`](file:///frontend/app.jsx), [`server.js`](file:///server.js) |
| **Data Engineering & ETL** | 11,282 normalized synthetic records (catalogue, GSTIN registry, Udyam registry, city tier mappings, SMB leads) loaded in sub-second execution with PostgreSQL / memory fallback. | [`node-src/db/preprocessAndLoad.js`](file:///node-src/db/preprocessAndLoad.js) |

---

## Real-Time Live AI Pipeline Visualizer (11 Stages)

The left side of the UI features an interactive customer chat with voice input and audio playback. The right side renders the real-time AI pipeline trace:

1. **Stage 1 · Customer Speech:** Audio byte stream, recording status, format.
2. **Stage 2 · Speech-to-Text:** Raw Sarvam STT (`saaras:v3`) and natural cleaned transcript.
3. **Stage 3 · Language Detection:** Dynamic Indic language badge (`English`, `Hindi`, `Telugu`, `Tamil`, `Mixed Hinglish`).
4. **Stage 4 · Schema Extraction:** Structured JSON extracted from the latest turn (Sarvam `sarvam-105b-conversations`).
5. **Stage 5 · Schema Diff:** Visual diff cards (`Previous Schema ➔ Current Schema`) highlighting newly updated fields.
6. **Stage 6 · Missing Information:** Deterministic list of remaining required discovery fields.
7. **Stage 7 · Completion Meter:** Animated progress bar and completion percentage.
8. **Stage 8 · Question Planner:** Rationalized next question reason and canonical question formulation.
9. **Stage 9 · Conversation Memory:** Full multi-turn context history sent to the LLM.
10. **Stage 10 · Current Customer Schema:** Live validated customer JSON schema state.
11. **Stage 11 · Ready Status:** Status banner (`Ready for Recommendation: NO ➔ YES`).

---

## Security & DPDP Act 2023 Compliance

1. **AES-256-GCM Cryptographic Storage:** Document buffers are encrypted with unique 96-bit initialization vectors (IVs) and authenticated verification tags.
2. **Zero-Residue Memory Safety:** In-memory RAM buffers are zeroed out immediately after OCR execution (`securePurgeBuffer()`) to prevent residual memory dumps.
3. **Data Minimization & Masking:** Identifiers are masked in UI and logs (e.g. `27XXXXXXXX7D1ZP`), while SHA-256 hashes enable duplicate checks without storing plaintext.

---

## Project Structure

```text
├── node-src/                      # Clean Architecture Backend
│   ├── config.js                  # Environment & Sarvam API configuration
│   ├── models/
│   │   └── customerSchema.js      # CustomerSchema (23 fields, numeric coercion, safe merge)
│   ├── services/
│   │   ├── conversationManager.js # 11-stage pipeline orchestrator
│   │   ├── extractor.js           # Zero-hallucination Schema Extraction Agent
│   │   ├── detector.js            # Deterministic Missing Information Detector
│   │   ├── planner.js             # Prioritized Question Planner & Rationale Map
│   │   ├── recommendationEngine.js# Hard filtering & bundle ranking engine
│   │   ├── ocrService.js          # Smart KYC OCR & registry cross-referencing
│   │   ├── imagePreprocessor.js   # Contrast enhancement & 4-way rotation correction
│   │   ├── secureVault.js         # AES-256-GCM encryption & RAM zero-purging
│   │   ├── orderService.js        # Order lifecycle, contracts & escalations
│   │   ├── targetSegmentService.js# Business type to canonical segment mapper
│   │   ├── cityTierTool.js        # City tier lookup (Tier 1 vs Tier 2)
│   │   ├── sttCleaner.js          # Speech text sanitizer with identifier protection
│   │   ├── sessionStore.js        # Multi-turn in-memory session manager
│   │   └── sarvamClient.js        # Sarvam AI Node SDK Wrapper (Chat & STT)
│   └── db/
│       ├── dbClient.js            # Dual PostgreSQL + Persistent Memory Client
│       └── preprocessAndLoad.js   # Automated ETL pipeline for 11,282 CSV records
├── docker/
│   └── init-db/
│       └── 01-init-tables.sql     # PostgreSQL relational schema (4 tables, indexes)
├── docker-compose.yml             # PostgreSQL 16 container with persistent volumes
├── Dockerfile                     # Production Node.js Alpine container
├── node-tests/                    # Automated Test Suite (41 tests passing)
│   ├── customerSchema.test.js
│   ├── sttCleaner.test.js
│   ├── detectorAndPlanner.test.js
│   ├── conversationScenarios.test.js
│   ├── databaseEtl.test.js
│   ├── secureVault.test.js
│   ├── smartOcrService.test.js
│   ├── orderLifecycle.test.js
│   └── recommendationEngine.test.js
├── frontend/
│   ├── index.html                 # HTML5 container with React 18 & Babel
│   ├── style.css                  # Airtel Business enterprise dark theme
│   └── app.jsx                    # React Application (Chat, Visualizer, KYC, Sales Portal)
├── YTL_TrackA_Udyam_Digital_Data/ # Dataset: Products, GSTIN, Udyam, Leads, Specimen KYC
├── data/                          # Persistent preprocessed JSON summaries
├── server.ts                      # Strongly-typed Express Server Entrypoint
├── server.js                      # Dual JS Server Entrypoint & API Routes
├── tsconfig.json                  # TypeScript compiler configuration
├── package.json                   # Project manifest & test scripts
├── .env.example                   # Environment configuration template
└── README.md
```

---

## Quickstart Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- [Sarvam AI API Key](https://www.sarvam.ai/)
- (Optional) [Docker Desktop](https://www.docker.com/) for containerized PostgreSQL

### 2. Clone & Install
```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
npm install
```

### 3. Setup Environment Variables
Create a `.env` file in the project root:
```bash
cp .env.example .env
```
Fill in your API credentials:
```ini
SARVAM_API_KEY=your_sarvam_api_key_here
PORT=8000
```

### 4. Run Preprocessing & ETL
Populates the in-memory/PostgreSQL stores with 11,282 normalized records from the synthetic dataset:
```bash
npm run db:preprocess
```

### 5. Start the Application
```bash
# Run with TypeScript runtime (tsx):
npm start

# Run with TypeScript hot-reload watch mode:
npm run dev

# Run TypeScript type checker:
npm run typecheck

# Build / compile to ./dist:
npm run build

# Run legacy JavaScript server (optional):
npm run start:js
```
The application will be live at: **`http://localhost:8000`**

---

## Running with Docker Compose

To run the complete containerized stack (Node.js application + PostgreSQL 16 with persistent volume storage):

```bash
docker compose up -d
```
- **Web Application:** `http://localhost:8000`
- **PostgreSQL:** Port `5432` with volume `postgres_data`

---

## Automated Test Suite

Run the full suite of **41 automated tests**:

```bash
npm test
```

### What is tested:
- **Conversation & Extraction:** Multi-entity extraction, multi-lingual turns (Telugu, Hindi, English), safe schema merging.
- **Detector & Planner:** Deterministic missing field identification and priority selection.
- **Database & ETL:** Registry verification (GSTIN, Udyam, Products, SMB Leads).
- **Security & Privacy:** AES-256-GCM encryption/decryption, tampering detection, RAM buffer zero-purging, identifier masking.
- **Smart KYC OCR:** Document validation against registry, handling degraded/rotated images, detecting cancelled certificates.
- **Recommendation Engine:** Rule-based bundle eligibility, GSTIN gating, What-If unlock insights.
- **Order Lifecycle:** Contract generation, status progression, escalations, drop reasons.

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server and persistent store health status |
| `POST` | `/chat` | Process conversation turn and return 11-stage pipeline trace |
| `POST` | `/voice` | Upload audio recording for Sarvam STT and discovery processing |
| `GET` | `/api/database/status` | Database connection status and record counts |
| `GET` | `/api/products` | Retrieve all 25 catalogue products |
| `GET` | `/api/lookup/gstin/:gstin` | Cross-reference GSTIN with mock registry |
| `GET` | `/api/lookup/udyam/:udyam` | Cross-reference Udyam number with mock registry |
| `POST` | `/api/orders/accept` | Accept quote, verify KYC, generate contract, start order tracker |
| `POST` | `/api/orders/reject` | Record quote drop reason, customer feedback, and counter-offer |
| `POST` | `/api/kyc/upload` | Securely upload KYC document for OCR extraction and registry check |

---

## License & Disclaimer

This project is developed for the **Accel YTL Hackathon**. All businesses, people, identifiers, and documents in the dataset are synthetic and fictional.

Licensed under the [ISC License](LICENSE).
