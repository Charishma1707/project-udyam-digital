# Project Directory Structure

The project follows the following directory structure.

project-root/

├── data/
│   ├── product_catalogue.csv
│   ├── smb_leads.csv
│   ├── mock_gstin_registry.csv
│   ├── mock_udyam_registry.csv
│   └── kyc_documents/
│        ├── K01/
│        ├── K02/
│        ├── ...
│
├── app/
│   ├── agents/
│   ├── services/
│   ├── repositories/
│   ├── models/
│   ├── api/
│   ├── prompts/
│   ├── utils/
│   └── config/
│
├── tests/
│
├── PROJECT_CONTEXT.md
└── README.md

---

# Dataset Locations

Always load datasets from the data folder.

## data/product_catalogue.csv

Purpose

Master catalogue containing all Airtel Business products.

Always use this file when

- Filtering eligible products
- Reading product descriptions
- Reading pricing
- Reading contract duration
- Reading dependencies
- Reading related products
- Reading target segments
- Reading GST requirements
- Reading employee/site requirements

Never hardcode product information.

---

## data/smb_leads.csv

Purpose

Historical customer intelligence.

Always use this file when

- Finding similar customers
- Historical bundle recommendation
- Calculating bundle popularity
- Calculating activation rate
- Calculating acceptance rate
- Calculating NPS
- Calculating churn
- Learning historical pricing
- Finding historical contract duration
- Learning customer behaviour
- Finding common drop reasons

Never use this file as product catalogue.

---

## data/mock_gstin_registry.csv

Purpose

Mock GST verification database.

Always use this file when

- GST lookup
- GST validation
- Checking GST status
- Fetching legal business name
- Fetching registered address
- Validating active/inactive GST

Never infer GST information from customer conversation.

---

## data/mock_udyam_registry.csv

Purpose

Mock MSME (Udyam) verification database.

Always use this file when

- Udyam lookup
- MSME verification
- Fetching enterprise category
- Validating registration

---

## data/kyc_documents/

Purpose

Sample KYC documents.

Contains

- PAN
- GST Certificate
- Udyam Certificate
- Address Proof
- Identity Proof

Use these documents only for

OCR

↓

Field Extraction

↓

Validation

↓

Risk Detection

↓

Human Review

Never use OCR results without validation.

---

# File Responsibilities

product_catalogue.csv

↓

Product Recommendation Engine

↓

Eligibility Engine

↓

Pricing Engine

↓

Dependency Engine

↓

Quote Generator

--------------------------------

smb_leads.csv

↓

Similarity Engine

↓

Historical Analytics

↓

Bundle Recommendation

↓

Contract Recommendation

↓

Pricing Optimization

↓

Confidence Score

--------------------------------

mock_gstin_registry.csv

↓

GST Lookup API

↓

Business Verification

↓

Address Verification

--------------------------------

mock_udyam_registry.csv

↓

MSME Verification

↓

Business Classification

--------------------------------

kyc_documents/

↓

OCR

↓

KYC Validation

↓

Fraud Detection

↓

Document Quality Checks