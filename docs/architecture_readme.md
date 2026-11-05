# Airtel Business — Project Udyam Digital
### Enterprise Conversational AI Advisor, 11-Stage Pipeline Visualizer & Smart Digital KYC Engine

[![Python](https://img.shields.io/badge/Python-3.13%2B-blue.svg)](main.py)
[![FastAPI](https://img.shields.io/badge/Framework-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![Pydantic v2](https://img.shields.io/badge/Validation-Pydantic%20v2-e92063.svg)](schema/customer_profile.py)
[![Pytest](https://img.shields.io/badge/Tests-14%2F14%20Passed-brightgreen.svg)](tests/)
[![Docker](https://img.shields.io/badge/Docker-PostgreSQL%2016-blue.svg)](docker-compose.yml)
[![Sarvam AI](https://img.shields.io/badge/AI%20Engine-Sarvam%20Indic%20105B-orange.svg)](https://www.sarvam.ai/)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%20Act%202023-purple.svg)](#security--dpdp-act-2023-compliance)

---

## Executive Summary

Built for the **Accel YTL Hackathon (Track A)**, **Project Udyam Digital** is an enterprise-grade AI sales platform for **Airtel Business (B2B)** designed to serve India's 6+ crore Micro, Small, and Medium Enterprises (MSMEs).

It solves key telecom conversion friction points—17.6-day activation cycle times, 56% post-needs-assessment drop-offs, and 3x manual follow-ups—through an autonomous, modular Python architecture:

```
[Voice / Text Chat in Indic Languages]
               │
               ▼
[11-Stage AI Discovery Agent] ──► [Deterministic Question Planner]
               │
               ▼
[Hard Filtering & Bundle Engine] ──► [Top 2 Bundles + What-If Unlocks]
               │
               ▼
[Smart Digital KYC & OCR Engine] ──► [AES-256-GCM + RAM Zero-Purging]
               │
               ▼
[Quote Acceptance & SLA Contract] ──► [5-Milestone Order Tracker & Escalations]
```

---

## Clean Modular Architecture

The repository is organized into dedicated, readable Python packages:

```text
├── agent/                             # Conversational AI & 11-Stage Pipeline
│   ├── discovery_agent.py             # 11-stage trace generator and orchestrator
│   ├── sarvam_llm_client.py           # Sarvam AI Indic LLM & Speech-to-Text client
│   ├── entity_extractor.py            # Zero-temperature schema extraction agent
│   ├── question_planner.py            # Deterministic missing field prioritized question planner
│   ├── speech_cleaner.py              # Speech sanitizer & GSTIN/Udyam identifier protection
│   └── session_memory.py              # Thread-safe multi-turn session store
│
├── schema/                            # Pydantic v2 Data Models
│   ├── customer_profile.py            # 23-field CustomerSchema with numeric coercion & safe merge
│   └── api_models.py                  # Typed request/response contracts for REST endpoints
│
├── data_preprocessing/                # ETL & Reference Data Mappings
│   ├── etl_pipeline.py                # Automated parser for 11,282 synthetic records
│   ├── city_tier_mapping.py           # Indian city to telecom network tier (Tier 1 vs 2) tool
│   └── business_segment_mapper.py     # Deterministic 4-tier business type to segment resolver
│
├── recommendation/                    # Recommendation & Scoring
│   └── bundle_engine.py               # Eligibility filtering, scoring formula, What-If simulator
│
├── kyc_verification/                  # Smart Digital KYC & Compliance
│   ├── smart_kyc_service.py           # OCR extraction, registry cross-check, status validation
│   └── secure_vault.py                # AES-256-GCM encryption & RAM zero-purging (DPDP Act 2023)
│
├── order_tracking/                    # Order Fulfillment & Sales Portal
│   └── order_lifecycle.py             # Dynamic SLA contracts, 5-milestone tracker, lost quote log
│
├── database/                          # Persistence & Registries
│   └── db_client.py                   # PostgreSQL connection + high-speed in-memory store
│
├── frontend/                          # Web User Interface
│   ├── index.html                     # HTML5 single-page application mount
│   ├── database.html                  # Interactive Database Explorer interface
│   ├── style.css                      # Airtel Business enterprise dark theme
│   └── app.jsx                        # React 18 UI (Live Chat + 11-Stage Pipeline Visualizer)
│
├── tests/                             # Automated Test Suite (14 passing tests)
│   ├── test_agent_pipeline.py         # Pipeline trace, STT cleaner, planner tests
│   ├── test_customer_schema.py        # Schema coercion, defaults, safe merge tests
│   ├── test_recommendation.py         # Bundle engine, segment mapping, what-if tests
│   ├── test_kyc_and_security.py       # AES-256-GCM, PII masking, registry validation tests
│   └── test_api_endpoints.py          # FastAPI endpoint integration tests
│
├── YTL_TrackA_Udyam_Digital_Data/     # Dataset: Products, GSTIN, Udyam, Leads, Specimen KYC
├── data/                              # Preprocessed normalized JSON caches
├── main.py                            # Single FastAPI server entrypoint
├── requirements.txt                   # Pure Python dependencies
├── Dockerfile                         # Python 3.13 container definition
└── docker-compose.yml                 # PostgreSQL container + persistent volumes
```

---

## Real-Time Live AI Pipeline Visualizer (11 Stages)

The split-screen user interface provides transparency for debugging, demonstrations, and hackathon judging:

1. **Stage 1 · Customer Speech:** Audio byte stream, recording status, format.
2. **Stage 2 · Speech-to-Text:** Raw Sarvam STT (`saaras:v3`) and cleaned natural transcript.
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

1. **AES-256-GCM Cryptographic Storage:** Raw document buffers are encrypted with unique 96-bit initialization vectors (IVs) and authenticated verification tags.
2. **Zero-Residue Memory Safety:** In-memory RAM buffers are zeroed out via `secure_purge_buffer()` immediately post-OCR to thwart memory dumps.
3. **Data Minimization & Masking:** Identifiers are masked in public responses and UI (e.g., `27XXXXXXXX7D1ZP`, `UDYAM-00-XXXX567`), while SHA-256 hashes enable duplicate checks without storing plaintext.

---

## Quickstart Guide

### 1. Prerequisites
- [Python 3.10+](https://www.python.org/)
- [Sarvam AI API Key](https://www.sarvam.ai/) (optional for local mock testing)

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Setup Environment Variables
Create a `.env` file in the project root:
```ini
SARVAM_API_KEY=your_sarvam_api_key_here
PORT=8000
```

### 4. Run the Application
```bash
python main.py
```
Or with Uvicorn hot-reload:
```bash
uvicorn main:app --reload --port 8000
```
Open your browser at: **`http://localhost:8000`**

- **Main AI Chat & Visualizer:** [`http://localhost:8000/`](http://localhost:8000/)
- **Interactive Database Explorer:** [`http://localhost:8000/database`](http://localhost:8000/database)
- **Interactive API Docs (Swagger):** [`http://localhost:8000/docs`](http://localhost:8000/docs)

---

## Automated Test Suite

Run all **14 automated tests**:

```bash
pytest tests/ -v
```

### Test Coverage:
- `test_agent_pipeline.py`: 11-stage trace execution, speech normalization, question priority planner.
- `test_customer_schema.py`: Numeric string coercion, null protection, safe merge logic.
- `test_recommendation.py`: Commercial eligibility rules, segment mapping, bundle formulation.
- `test_kyc_and_security.py`: AES-256-GCM encryption/decryption, PII masking, registry checks.
- `test_api_endpoints.py`: FastAPI routes (`/health`, `/api/products`, `/api/database/status`, `/chat`).

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health check returning backend status and DB connection |
| `POST` | `/chat` | Process customer text message and return 11-stage pipeline trace |
| `POST` | `/voice` | Upload audio recording for Sarvam STT and discovery processing |
| `GET` | `/database` | Interactive Database Table Explorer interface |
| `GET` | `/api/database/status` | Database connection status and record counts |
| `GET` | `/api/database/table/{name}` | Fetch rows from specific database table |
| `GET` | `/api/products` | Retrieve all 25 catalogue products |
| `GET` | `/api/lookup/gstin/{gstin}` | Cross-reference GSTIN with mock government registry |
| `GET` | `/api/lookup/udyam/{udyam}` | Cross-reference Udyam number with mock MSME registry |
| `POST` | `/api/orders/accept` | Accept quote, verify KYC, generate contract, start order tracker |
| `POST` | `/api/orders/reject` | Record quote drop reason, customer feedback, and counter-offer |
| `POST` | `/api/kyc/upload` | Securely upload KYC document for OCR extraction and registry check |

---

## License & Disclaimer

Developed for the **Accel YTL Hackathon (Track A)**. All businesses, people, identifiers, documents, and figures in the dataset are synthetic and fictional.
