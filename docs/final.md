Phase 1 — Voice → Customer Schema
Input
Audio Stream

OR

Natural Language Conversation

Output
{
  "business_name":"",
  "business_type":"",
  "target_segment":"",
  "city":"",
  "state":"",
  "employee_count":0,
  "num_sites":0,
  "annual_turnover_band":"",
  "monthly_budget":0,
  "preferred_language":"",
  "needs":[],
  "has_gstin":true,
  "gstin":"",
  "has_udyam":false,
  "udyam_number":"",
  "required_installation_days":7,
  "customer_constraints":[]
}

Responsibilities
- Multi-language speech recognition
- Conversation
- Extract structured schema
- Ask only missing fields
- Validate GST/Udyam format
- Determine target segment
- Show live extracted schema
Phase 2 — Candidate Product Retrieval
Input
CustomerSchema

Output
{
 "candidate_products":[...],
 "filtered_products":[...],
 "dependency_products":[...]
}

Responsibilities
- Map business type → SMB segment
- Filter products by
Target Segment

Employee Count

Site Count

GST

Udyam

City Tier

Installation Days

- Expand dependencies recursively
- Remove ineligible products
Phase 3 — Historical Retrieval
Input
CustomerSchema

+

Candidate Products

Output
{
 "similar_customers":[...],
 "historical_statistics":{}
}

Responsibilities

Hard SQL Filter
Segment

City Tier

Employees

Sites

Budget

GST

Business Type

Soft Similarity
Needs

Business Type

Products Interested

Bundle Bought

Employee Similarity

Budget Similarity

Return

Top
30-50

Similar Customers
Phase 4 — Historical Analytics
Input
Top Similar Customers

Output
{
 "bundle_statistics":[],
 "product_statistics":[],
 "addon_statistics":[]
}

Calculate

Bundles
Popularity

Acceptance Rate

Activation Rate

Average Price

Average Setup Fee

Average Contract

Average Installation

Average NPS

Churn

Price Rejection

Drop Reasons

Products
Interest Count

Bought Count

Conversion Rate

NPS

Churn

Add-ons
Bought Together

Acceptance

NPS

Churn

Phase 5 — Bundle Generator
Input
Customer Needs

Candidate Products

Historical Statistics

Output
{
 "candidate_bundles":[]
}

Responsibilities

Generate

Only

Valid Bundles

Ensure
Dependencies

Eligibility

Budget

Installation

Generate

Top
5-10

Bundles
Phase 6 — Bundle Scoring
Input
Candidate Bundles

Output
{
 "ranked_bundles":[]
}

Score using
Need Coverage

Historical Popularity

Acceptance Rate

Activation

Average NPS

Low Churn

Budget Match

Installation Match

Product Conversion

Dependency Complete

Price Rejection Penalty

Return

Top
3

Bundles
Phase 7 — Pricing
Input
Top Bundles

Output
{
 "monthly_price":,
 "setup_fee":,
 "contract":,
 "discount":,
 "price_reason":""
}

Responsibilities

Calculate
Historical Accepted Price

Historical Setup Fee

Historical Contract

Catalog Min

Catalog Max

Budget

Never exceed

Catalog Limits
Phase 8 — Add-on Recommendation
Input
Selected Bundle

Output
{
 "addons":[]
}

Score
Frequently Bought Together

Need Match

Acceptance

NPS

Low Churn

Budget

Dependencies

Return

Top
3

Add-ons
Phase 9 — Confidence
Input
Final Bundle

History

Output
{
 "confidence":94,
 "sales_action":"AUTO_APPROVE"
}

Confidence Factors
Historical Sample Size

Average Similarity

Acceptance Rate

Average NPS

Low Churn

Dependency Validity

Eligibility Validity

Decision
90+

Auto Quote

70-90

Sales Review

<70

Manual Recommendation

Phase 10 — AI Explanation
Input
Final Recommendation

Output

Natural Language

Explain
Why Bundle

Why Price

Why Contract

Why Add-ons

Why Confidence

Why Similar Customers

Business Benefits

LLM never decides products or pricing.

Only explains deterministic results.
Validation Prompt for Claude
Validate the complete recommendation pipeline.

Check:

1. Is every phase deterministic where possible?
2. Is the LLM only used for NLP and explanation?
3. Are dependencies always satisfied?
4. Is bundle generation logically correct?
5. Is the scoring strategy reasonable?
6. Is confidence calculated correctly?
7. Are add-ons generated logically?
8. Are prices based on history and catalog constraints?
9. Are historical funnel stages used appropriately?
10. Suggest improvements used in production recommendation systems.

Do not rewrite the architecture. Only identify weaknesses and recommend improvements.
Phase 11 — Confidence & Escalation Engine
Input
{
  "selected_bundle": {},
  "similar_customers": [],
  "historical_statistics": {},
  "customer_schema": {}
}

Output
{
  "confidence": 93,
  "risk_level": "LOW",
  "sales_action": "AUTO_APPROVE",
  "reasons": [
    "High similarity with historical customers",
    "Bundle has high acceptance",
    "Low churn",
    "All dependencies satisfied"
  ]
}

Confidence Components
Instead of a random AI confidence.

Calculate deterministically.
Factor	Weight
Similarity Score	25
Number of Similar Customers	20
Bundle Acceptance Rate	15
Average NPS	10
Churn	10
Dependency Satisfaction	5
Eligibility Checks Passed	5
Price Confidence	5
OCR/KYC Confidence	5


Total = 100

Example
Similarity            95

History               180 customers

Acceptance            92%

NPS                   9.2

Churn                 3%

Dependencies          OK

Eligibility           OK

Price                 Historical

OCR                   99%

Confidence
95%

Escalation Rules
Confidence ≥ 90

↓

Auto Generate Quote

70 ≤ Confidence < 90

↓

Recommend

↓

Sales Review Required

Confidence < 70

↓

Escalate

↓

Senior Sales Executive

Additional escalation triggers

Even with high confidence

Escalate if
Bundle value > ₹50,000

OR

OCR mismatch

OR

GST mismatch

OR

Customer requests custom pricing

OR

No similar customers found

OR

Eligibility conflict

OR

AI extracted low-confidence schema

Phase 12 — OCR + Smart KYC
Input
Images

GST Certificate

Udyam Certificate

PAN

Aadhaar

Address Proof

Output
{
  "documents": [],
  "verification_status": "PASSED",
  "ocr_confidence": 98,
  "issues": []
}

Pipeline
Upload

↓

OCR

↓

Extract Text

↓

Normalize

↓

Validate

↓

Registry Check

↓

Flag Errors

↓

KYC Result

OCR
Use
- Google Vision
- Tesseract
- Azure OCR
- Sarvam OCR (if available)
Extract
{
 "gstin":"",
 "business_name":"",
 "address":"",
 "owner":"",
 "issue_date":""
}

Validation
GST
Check
Format

↓

Checksum

↓

Exists in Registry

↓

Business Name Match

Udyam
Check
Number Format

↓

Exists

↓

Business Match

Address Proof
Check
Date

↓

Within 90 Days

↓

Address Match

PAN
Check
PAN

↓

Matches GST

↓

Matches Owner

OCR Confidence
Each field
GST

99%

PAN

98%

Address

85%

Overall
94%

If
OCR < 85%

Ask customer
Please upload a clearer document.

Smart KYC Flags
{
 "issues":[
   "GST number mismatch",
   "Expired address proof",
   "Business name mismatch"
 ]
}

Phase 13 — Order Tracking
Input
{
 "lead_id":"L001",
 "bundle":[],
 "installation_days":7
}

Output
{
 "current_stage":"KYC Complete",
 "expected_activation":"2026-07-18",
 "remaining_steps":[]
}

Stages
Lead

↓

Contacted

↓

Needs Assessment

↓

Quote

↓

KYC

↓

Activation

Track
Current Stage

Completed Stages

Expected Next Stage

Expected Activation

Delay Reason

Example
KYC Completed

↓

Expected Installation

3 Days

↓

Expected Activation

18 July

If delayed
Current

KYC

Expected

2 Days

Actual

6 Days

Flag
Installation Delay

AI Timeline
Instead of showing boring text
✓ Customer Profile Completed

✓ Product Eligibility Verified

✓ Similar Businesses Found

✓ Bundle Selected

✓ Price Generated

✓ Quote Generated

✓ Awaiting KYC

□ Installation

□ Activation

Very impressive during demo.
Complete Pipeline
Voice Conversation
        │
        ▼
Customer Schema
        │
        ▼
Eligibility Filtering
        │
        ▼
Dependency Resolution
        │
        ▼
Similarity Search
        │
        ▼
Historical Analytics
        │
        ▼
Bundle Generation
        │
        ▼
Bundle Scoring