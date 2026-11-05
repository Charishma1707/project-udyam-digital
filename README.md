# Airtel Business — Project Udyam Digital

> **Enterprise B2B Conversational AI Discovery, Smart Digital KYC & Order Provisioning Platform**

[![Python 3.13](https://img.shields.io/badge/Python-3.13%2B-blue.svg)](backend/)
[![FastAPI](https://img.shields.io/badge/Framework-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2F%20Neon-4169e1.svg)](https://neon.tech/)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%20Act%202023-purple.svg)](docs/)

---

## Clean 3-Tier Project Structure

The project has been separated into dedicated directories for **Backend**, **Frontend**, and **Documentation**:

```text
├── backend/                  # Python FastAPI Backend Services
│   ├── agent/                # 11-Stage Conversational AI & Discovery Agent
│   ├── config/               # Telephony cohorts, pricing, and scoring configs
│   ├── data/                 # City tier mappings, business taxonomy & SQLite vault
│   ├── database/             # Neon Cloud PostgreSQL client & connection pooling
│   ├── data_preprocessing/   # City tier classifier, business segment mapper & ETL
│   ├── eval/                 # Discovery pipeline evaluation harness & benchmarks
│   ├── kyc_verification/     # Smart Digital KYC engine (Tesseract OCR, Mod-36, AES-256)
│   ├── order_tracking/       # Order Management System (OMS) & 4-milestone stepper
│   ├── recommendation/       # Bundle recommendation engine & toggle addons
│   ├── schema/               # Pydantic v2 data models & API contracts
│   ├── scripts/              # Cloud database seeding & migration scripts
│   ├── tests/                # Pytest unit & integration test suite
│   ├── YTL_TrackA_Udyam_Digital_Data/ # Ground-truth MSME registries & test KYC documents
│   ├── main.py               # Main FastAPI server entry point
│   └── requirements.txt      # Python dependencies
│
├── frontend/                 # Interactive Web User Interface
│   ├── index.html            # Production-grade Single-Page Application (SPA)
│   ├── database.html         # Interactive Neon PostgreSQL table visualizer
│   ├── style.css             # Airtel Red & Slate CSS styling
│   ├── images/               # Airtel logos, avatar media & badges
│   ├── vendor/               # Vendor scripts (Babel, Tailwind, etc.)
│   └── stitch/               # Original Stitch UI screen archives & prototypes
│
├── docs/                     # Project Documentation & Markdown Files
│   ├── project_context.md    # Problem statement, MSME personas & technical requirements
│   ├── backend.md            # Comprehensive backend API & service architecture
│   ├── DESIGN.md             # Design tokens, color palette, and component specs
│   ├── reccomendation.md     # 4-stage deterministic recommendation engine guide
│   ├── kyc_eval.md           # Smart KYC OCR & DPDP Act 2023 compliance evaluation
│   ├── preprocessing.md      # Data preprocessing & MSME taxonomy classification
│   ├── eval_report.md        # AI Discovery Agent benchmark results
│   ├── claude.md             # Architecture review & system specifications
│   ├── final.md              # Hackathon submission summary
│   ├── architecture_readme.md# Original comprehensive project README
│   └── case_study/           # Airtel SYNC case study PDF & submission deck
│
├── run.py                    # One-command root application launcher
├── requirements.txt          # Root Python dependencies mirror
└── README.md                 # Project root index (this file)
```

---

## Quick Start Guide

### 1. Prerequisites & Installation
Ensure you have **Python 3.10+** installed:
```bash
pip install -r requirements.txt
```

### 2. Launch the Application
Start both backend services and frontend UI with a single command from the project root:
```bash
python run.py
```
*Or alternatively from the `backend/` directory:*
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Open in Browser
- **Enterprise Web App**: [http://localhost:8000/](http://localhost:8000/)
- **Interactive API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neon Cloud Database Explorer**: [http://localhost:8000/database](http://localhost:8000/database)
- **System Health Status**: [http://localhost:8000/health](http://localhost:8000/health)

---

## Key Features

1. **Enterprise Products Catalogue (`frontend/index.html` Tab 1)**:
   - Full 25 Airtel B2B products fetched dynamically from `/api/products`.
   - Real-time search, category filters (Connectivity, Security, Cloud, Voice), and instant quote addition.

2. **AI Telecom Advisor - Soumya (`frontend/index.html` Tab 2)**:
   - 11-stage autonomous discovery agent with multi-turn conversation memory.
   - Dynamic quote builder with interactive add-on toggles (Cisco router +₹800, 24/7 SLA +₹600, failover SIM +₹350).
   - Instant SLA contract generation and one-click quote acceptance.

3. **Smart Digital KYC Engine (`frontend/index.html` Tab 3)**:
   - DPDP Act 2023 compliant verification with RAM zero-purging.
   - Tesseract OCR document extraction, GSTIN Mod-36 checksum calculation, and AES-256-GCM encryption.

4. **Live Provisioning Tracker (`frontend/index.html` Tab 4)**:
   - 4-milestone lifecycle stepper: Commercial Contract → Feasibility → Optical Splicing → Active SLA.
   - Lead field engineer contact, MTTR commit clock, and live progress bar.

5. **Operations NOC Command Center (`frontend/index.html` Tab 5)**:
   - Live order dispatch queue with real-time milestone stage updater.
   - Direct PostgreSQL database synchronization and escalation resolution.

6. **Cloud Database Table Explorer (`frontend/index.html` Tab 6)**:
   - Live viewer for Neon PostgreSQL tables (`product_catalogue`, `gstin_registry`, `udyam_registry`, `orders`, `kyc_records`).

---

## Documentation Index

All architectural markdown files are organized in the [`docs/`](docs/) directory:
- [Problem & Context (`docs/project_context.md`)](docs/project_context.md)
- [Backend Architecture (`docs/backend.md`)](docs/backend.md)
- [Design Specifications (`docs/DESIGN.md`)](docs/DESIGN.md)
- [Recommendation Engine Guide (`docs/reccomendation.md`)](docs/reccomendation.md)
- [KYC Engine & DPDP Act Evaluation (`docs/kyc_eval.md`)](docs/kyc_eval.md)
- [Discovery Benchmark Report (`docs/eval_report.md`)](docs/eval_report.md)
