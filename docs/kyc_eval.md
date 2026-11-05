# Project Udyam Digital — Smart Digital KYC & Edge Case Evaluation Report
**Reference Date:** 2026-07-15 | **Regulatory Standard:** DPDP Act 2023 & DoT Telecom Guidelines | **Dataset:** YTL Track A (K01–K12)

---

## 1. Executive Summary
The Smart Digital KYC engine executes a multi-tier pipeline combining **pre-processing image quality inspection**, **intra-document structure and checksum verification**, **temporal freshness checks**, **cross-document consistency**, and **live validation against 3,534 GSTIN and 2,723 MSME Udyam government mock registries**.

| Metric | Target | Result | Status |
|---|---|---|---|
| **Total Test Applicants** | 12 (K01 to K12) | **12** | **Complete** |
| **Planted Defect Detection Rate** | 100% | **100%** (5/5 planted anomalies caught) | **PASSED** |
| **False Rejection Rate on Clean Applicants** | 0.0% | **0.0%** | **PASSED** |
| **Official GSTIN MOD-36 Checksum Validation** | 100% | **100%** | **PASSED** |
| **DPDP Act 2023 Masking & AES-256 Vault Hash** | Enforced | **Enforced** | **PASSED** |

---

## 2. Detailed Applicant Test Results (K01 to K12)

| Applicant ID | Enterprise Entity | Planted Problem / Test Case | Verification Result | Detected Issue Codes & Plain-Language Reason |
|:---:|:---|:---|:---:|:---|
| **K01** | Balaji Dental Care LLP (Kerala) | Clean submission with active GST & Udyam | **APPROVED** | None. All 4 documents verified and matched to active registry. |
| **K02** | Sneha Rao (Prop. Saffron Bakers) | Rotated/tilted scan (`K02_gst_certificate.png`) + State mismatch | **REJECTED** | `SKEWED_DOCUMENT_SCAN` (Auto-deskewed by 7.0°), `GST_STATE_CODE_MISMATCH` |
| **K03** | Joseph Joshi (Prop. Star Electronics) | Clean submission (Tamil Nadu) | **APPROVED** | None. Trade name, proprietor, and active GSTIN matched. |
| **K04** | Harpreet Bhat (Prop. Zenith Diagnostics)| Severely degraded / blurry GST scan (`sharpness=0.9`) | **REJECTED** | `BLURRY_DOCUMENT_SCAN` (Laplacian variance 0.9 < 85.0 threshold. Customer asked for clearer scan). |
| **K05** | Vikram Bhat (Prop. Royal Fashions) | Missing mandatory Udyam certificate | **REJECTED** | `MISSING_DOCUMENT_UDYAM` (Required document slot 'udyam' was not uploaded). |
| **K06** | Rekha Shah (Prop. Amrit Fashions) | Clean submission (Rajasthan) | **APPROVED** | None. Format, checksum, and registry active status confirmed. |
| **K07** | Shalini Nair (Prop. Green Leaf Physio) | Clean submission (Punjab) | **APPROVED** | None. Address, PIN code, and Udyam active status confirmed. |
| **K08** | Naveen Gupta (Prop. Royal Auto Components)| State code mismatch between GST and Udyam profile | **REJECTED** | `GST_STATE_CODE_MISMATCH` (GST state prefix '03' does not match registered state). |
| **K09** | Riddhi Fashions Pvt Ltd (Andhra) | Clean corporate submission | **APPROVED** | None. Pvt Ltd constitution, partner designation, and registry matched. |
| **K10** | Farhan Sharma (Prop. Ganga Stationers) | Minor trade name variance | **APPROVED** | `BUSINESS_NAME_SIMILARITY_LOW` (Warning only; rapidfuzz score in 75–90% confirmation band). |
| **K11** | Meera Kulkarni (Prop. Sahyadri Realty) | **Suspended GSTIN** in official registry (`23QYBXS1811Q1ZD`) | **REJECTED** | `GSTIN_REGISTRY_STATUS_INACTIVE` (GSTIN has status 'Suspended' in the official registry. Blocked from enterprise leased lines). |
| **K12** | Shree Legal Associates Pvt Ltd | Clean corporate submission (Maharashtra) | **APPROVED** | None. Active GSTIN, valid Udyam, active SLA clearance granted. |

---

## 3. Edge Case Coverage Matrix

### 3.1 Intra-Document Format & Cryptographic Validation
- **Official GSTIN MOD-36 Luhn-variant Checksum**: Tested with tampered check digits; immediately caught with `INVALID_GSTIN_CHECKSUM`.
- **Format Integrity**: Strict 15-character GSTIN regex (`[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}`) and Udyam regex (`UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}`).
- **PAN Digit Anomaly**: Warns if a synthetic document places a numeric digit (`0`) in the 5-letter PAN prefix.

### 3.2 Registry Status & Anti-Fraud
- **Active vs. Cancelled/Suspended**: Tested against `mock_gstin_registry.csv` and `mock_udyam_registry.csv`. Correctly blocks provisioning for suspended or cancelled tax accounts.
- **Unregistered Identifiers**: Forged or non-existent identifiers caught with `GSTIN_NOT_FOUND_IN_REGISTRY` and `UDYAM_NOT_FOUND_IN_REGISTRY`.

### 3.3 Temporal & Expiry Checks
- **90-Day Freshness Window**: Electricity bills dated older than 90 days from project reference date (`2026-07-15`) trigger `STALE_UTILITY_BILL`.
- **Future Dates**: Bills dated after the reference date trigger `FUTURE_DATED_UTILITY_BILL`.
- **Signatory Expiry**: IDs expired prior to the reference date trigger `EXPIRED_SIGNATORY_ID`.

### 3.4 Cross-Document Reconciliation
- **PAN Consistency**: Cross-verifies characters 3–12 of GSTIN (`gstin[2:12]`) against the authorized signatory ID number (`PAN_MISMATCH_WITH_GSTIN`).
- **6-Digit PIN Code Matching**: Cross-checks postal codes across GST registration and utility bill (`PIN_CODE_MISMATCH`).
- **State Code Reconciliation**: Ensures GST state code (digits 1–2) and Udyam state prefix (`UDYAM-XX-`) match the registered Indian state (`GST_STATE_CODE_MISMATCH`).
- **3-Band Fuzzy Name Matching**:
  - `Similarity >= 90%`: Auto-pass
  - `75% <= Similarity < 90%`: Confirmation warning logged (`BUSINESS_NAME_SIMILARITY_LOW`)
  - `Similarity < 75%`: Hard error rejection (`BUSINESS_NAME_MISMATCH`)

### 3.5 Privacy & DPDP Act 2023 Compliance
- **PII Masking**: GSTINs masked as `32XXXXXXXX4T1ZW`, PAN as `ABXXXXXX4F`, and Udyams as `UDYAM-KL-XXXX801`.
- **Cryptographic Storage**: Raw documents stored encrypted via AES-256-GCM with unique 96-bit IVs and SHA-256 integrity tokens.
- **Consent Logging**: Explicit timestamped consent recorded per purpose (`KYC_VERIFICATION`) with user/session linkage.
- **Zero-Purging Buffer**: Overwrites volatile RAM bytearrays with zero bytes upon processing completion.

