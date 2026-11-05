# PROJECT UDYAM DIGITAL — BUILD SPEC (read fully before writing code)

Hackathon: YTL Hackathon 2026, Enterprise Track A. Fictional operator "Accel Telecom" / B2B arm "Accel Business". All data is synthetic.
Goal: a mobile-first digital journey where an MSME owner discovers the right bundle, buys it and gets it activated with minimal human effort, in Hindi/English.
Today's date for ALL date logic: **2026-07-15**.

---

## 0. RULES FOR THE CODING AGENT (non-negotiable)

1. **Profile the real data first (Phase 0).** Do NOT assume column names, value formats or null conventions. Write `data_profile.md` listing every column, dtype, null %, distinct values, sample rows. All column names live in ONE mapping file (`config/columns.yaml`); no hard-coded column names elsewhere.
2. **Never invent numbers.** Every price, eligibility rule, dependency, contract and install time comes from `product_catalogue.csv`. Every statistic comes from computing on `smb_leads.csv`. If a value is missing, surface it in the UI/logs; do not make one up.
3. **The LLM never decides products, prices, eligibility, dependencies or contract.** LLM jobs are only: (a) extract customer profile from chat, (b) write the explanation from structured reason codes, (c) OCR/vision extraction from documents, (d) FAQ answers via RAG. Everything else is deterministic code.
4. **One validator gate.** Every bundle produced by any path (advisor, toggle, quantity edit, back-office) must pass `validate_bundle()` before display. Zero rule violations is a hard test.
5. **Config-driven.** Weights, thresholds, tax rate, retention windows, similarity bands live in `config/*.yaml`.
6. **Privacy by design (DPDP Act 2023).** Mask identifiers in UI and logs, redact identifiers before any LLM call, purpose-wise consent before KYC, retention limits. See section 11.
7. **Write tests as you go.** No module is "done" without unit tests. Report test results at the end of each phase.
8. If something is ambiguous, state your assumption in `ASSUMPTIONS.md` and continue; don't block.
9. Never hard-code secrets. Use env vars (`LLM_API_KEY`, `LLM_MODEL`).
9.look at presnt code if u think its good then dont chnage also dont chnage kyc pipleine code jsut hcek if it scorect nad hand;es alle ge cases 

---

## 1. DATA PACK

| File | Rows | Purpose |
|---|---|---|
| `product_catalogue.csv` | 25 | Rules, prices, setup, contract, install time, dependencies |
| `smb_leads.csv` | 5,000 | One quarter (Apr–Jun 2026) of leads, funnel stage, drop reason, bundle bought (activated), churn, NPS |
| `mock_gstin_registry.csv` | 3,534 | Backing data for mock GSTIN lookup API |
| `mock_udyam_registry.csv` | 2,723 | Backing data for mock Udyam lookup API |
| `kyc_documents/` | 47 images, 12 applicants K01–K12 | Specimen GST cert, Udyam cert, signatory ID, utility bill; some have planted problems |

### Catalogue columns
`product_id, category, product_name, description, unit, price_min_inr_per_month, price_max_inr_per_month, one_time_setup_inr, min_contract_months, available_city_tiers, min_employees, min_sites, requires_gstin (Y/N), requires_one_of (|-separated product_ids), typical_install_days, target_segments`

### Leads columns
`lead_id, created_date, lead_source, business_name, business_type, segment, city, city_tier, state, preferred_language, employee_count, num_sites, annual_turnover_band, has_gstin, gstin, has_udyam, udyam_number, current_internet, current_provider, monthly_telecom_spend_inr, products_of_interest (;-sep), contact_name, contact_role, stage_reached, outcome, drop_reason, contacted_date…activated_date, days_lead_to_activation, customer_follow_up_calls, bundle_products ("P01x1;P07x2"), monthly_bundle_value_inr, one_time_setup_inr, contract_months, churned_within_6_months, nps_score, acquisition_cost_inr`

### Registries (observed in samples; verify on full files)
- GSTIN: `gstin, legal_name, trade_name, constitution, principal_place_of_business, state, registration_date (DD-MM-YYYY), status (Active/Cancelled/Suspended)`. For proprietorships `legal_name` looks like `Person (Prop. Trade Name)`; match against `trade_name`.
- Udyam: `udyam_number (UDYAM-XX-00-NNNNNNN), enterprise_name, enterprise_type (Micro/Small/Medium), major_activity, nic_description, state, city, date_of_registration (DD-MM-YYYY)`.
- Some businesses appear in GSTIN but not Udyam and vice-versa → support "GSTIN only", "Udyam only", "both", "neither" paths.

### Data gotchas
- Dates are DD-MM-YYYY in registries; parse explicitly.
- GSTIN: 15 chars, valid checksum, PAN's 4th char always `X` (accept it). Checksum: mod-36 over `0-9A-Z`, odd-index chars ×2, even-index ×1, `p//36 + p%36` summed over first 14 chars, check = `(36 - sum%36) % 36`. Unit-test against ALL registry rows; if the algorithm fails on valid rows, fix it, don't loosen silently.
- Udyam district code is `00` (fictional).
- Boolean-ish columns (`has_gstin`, `churned_within_6_months`) may be Y/N, True/False or 1/0: normalise in one function.
- Bundle columns exist for activated leads. CHECK how many quote-accepted / KYC-complete leads have a non-empty `bundle_products` and report it.

---

## 2. SYSTEM ARCHITECTURE

Stack (unless told otherwise): Python 3.11 + FastAPI, **Postgres on Neon** (connection string in `DATABASE_URL`, already provisioned by the user), SQLAlchemy + Alembic migrations, psycopg 3, pandas, Pydantic v2, rapidfuzz, React/Next.js or Vite (mobile-first, Tailwind), LLM via Anthropic API (model from `LLM_MODEL`).

```
Mobile-first UI (EN/HI toggle)
  ├─ Advisor chat  ─► Advisor service (LLM slot extraction) ─► CustomerProfile
  ├─ Profile panel (GSTIN / Udyam what-if toggles)
  ├─ Options view (top-2) ─► Quote view (line items, add-on toggles)
  ├─ KYC (consent → upload → extract → validate)
  ├─ Tracker
  └─ Back-office (unclosed leads, propensity, insights)
API (FastAPI)
  ├─ data layer (Neon Postgres: catalogue, leads, registries, orders, consent_log, rec_log)
  ├─ stats builder (cohorts, attach rates, churn, NPS, spend ratio, price position)
  ├─ rules engine (eligibility, dependencies, quantities, validator)
  ├─ recommender (candidates → score → MMR top-2 → add-ons)
  ├─ pricing/quote (lines, setup, contract co-term, install ETA, tax)
  ├─ explainer (reason codes → LLM text → grounding check → template fallback)
  ├─ KYC service (checksum, registry lookup, OCR, fuzzy match, doc checks)
  ├─ consent service, order/tracker state machine
  └─ evaluation harness + insights endpoints
```
Produce an architecture diagram as Mermaid in `docs/architecture.md`.

---

## 3. PHASE 0 — DATA LAYER AND INSIGHTS ("read from DB, show insights")

Load all CSVs into the Neon Postgres database (see section 20) with typed columns, constraints and indexes, via idempotent loader scripts (re-running must not duplicate rows). Build `/api/insights/*` endpoints and a back-office Insights page that compute (from DB, never hard-coded):

1. **Funnel**: counts and % of previous stage (expect 5,000 → 3,406 → 1,974 → 861 → 588 → 368). Assert against README; flag mismatch.
2. **Conversion** (lead→activation and stage-to-stage) by: segment, city_tier, lead_source, has_gstin, has_udyam, preferred_language, num_sites, employee band, turnover band, response-time bucket (created→contacted days).
3. **GSTIN effect** (expect ~9.6% vs 2.0%), also controlled within segment, to avoid a size confound.
4. **Drop reasons** by stage_reached and by segment.
5. **Spend ratio**: `monthly_bundle_value_inr / monthly_telecom_spend_inr` per segment (median, p25, p75). Used for budget fit.
6. **Price position**: where `monthly_bundle_value_inr` falls between catalogue min and max for the bought products × quantities (median `t` per segment). Used for pricing.
7. **Interest-to-purchase gap**: `products_of_interest` minus `bundle_products` per segment (unmet needs).
8. **Attach rates** per product per segment; **co-purchase lift** per product pair per segment.
9. **Churn and NPS** by bundle, product, contract_months, segment (with sample sizes).
10. **Quantity drivers** per product (vs num_sites, employee_count).
11. **Time & friction**: days_lead_to_activation distribution; follow_up_calls vs NPS and churn; calibration of catalogue `typical_install_days` vs real gaps.
12. **Channel economics**: acquisition_cost_inr and conversion by lead_source.
13. **Planted signals**: scan for anomalies (e.g., response-time effect, source×segment interaction, tier effects) and list them in `docs/insights.md` with evidence.

Every insight shows sample size `n`; hide or grey out numbers with n below the min-sample threshold (config, default 20).

---

## 4. CUSTOMER PROFILE SCHEMA (input to the engine)

Same fields as the leads columns, so cohort matching works. The advisor fills this; the UI can edit it; the back-office can load it from a lead.

```json
{
  "segment": "Micro retail & services | Professional offices | Small multi-site | Small manufacturer",
  "business_type": "string",
  "city": "string", "city_tier": 1,
  "employee_count": 6, "num_sites": 1,
  "annual_turnover_band": "string|null",
  "has_gstin": true, "gstin_status": "Active|Cancelled|Suspended|Unknown",
  "has_udyam": true,
  "current_internet": "string|null", "current_provider": "string|null",
  "monthly_telecom_spend_inr": 2800,
  "needs": ["catalogue categories or product_ids"],
  "preferred_language": "hi"
}
```
- `gstin_valid_for_sale` = has_gstin AND registry status == Active. Cancelled/Suspended behaves as NO GSTIN (and triggers a KYC message).
- Segment may be inferred from business_type via a lookup table + fuzzy match (e.g. kirana, chemist, dawai ki dukaan, coaching).
- Provide `POST /api/profile/validate` returning missing/low-confidence fields.

### Profile what-if toggles (UI + API)
- Toggles for **Has GSTIN** and **Has Udyam** (and optionally tier, sites, employees) on the options page. Changing one re-runs the engine instantly via `POST /api/recommend` and shows a **diff**: products unlocked/locked, bundle changes, price change, and the message "With a valid GSTIN, N more products unlock: …". This is also the demo for judges.
- Locked products are shown as "unlocks with GSTIN", never silently hidden.
- Udyam toggle changes the KYC path (Udyam optional vs required per catalogue or policy; document which) and may change segment confirmation.

---

## 5. RULES ENGINE (deterministic, 100% tested)

### 5.1 Eligibility (filter, never a weight)
A product is eligible iff: tier ∈ `available_city_tiers` AND employee_count ≥ min_employees AND num_sites ≥ min_sites AND NOT (requires_gstin=Y AND NOT gstin_valid_for_sale). Return `(eligible: bool, reasons: [codes])` e.g. `MIN_SITES`, `NEEDS_GSTIN`, `TIER_NOT_AVAILABLE`, `MIN_EMPLOYEES`. Keep reasons for the UI and back-office.

### 5.2 Dependency closure
- `requires_one_of` = at least ONE listed product must be in the same bundle.
- If missing: add the best ELIGIBLE prerequisite (priority: already in bundle → highest cohort attach rate → cheapest). If none eligible: drop the dependent product and record reason `DEPENDENCY_UNSATISFIABLE`.
- Iterate to a fixed point (chains: Security → Email → Broadband). Guard against cycles with a banned set.
- Every auto-added item is labelled `auto_added_for=<product>` and shown in the UI.

### 5.3 Quantity model
Learn per product from activated bundles (`P01x2` parsing):
- If corr(qty, num_sites) > 0.5 → per-site. Else if corr(qty, employee_count) > 0.5 → per-user using the median qty/employee ratio. Else cohort/segment median. Min 1.
- Apply catalogue-implied limits (e.g. seats of a dependent product ≤ seats of its prerequisite if the unit implies it; verify from `unit`/description).
- Quantities are **pre-filled** and editable by +/- stepper; on edit, re-run validation and re-price live.

### 5.4 Validator
`validate_bundle(profile, bundle) -> violations[]`: eligibility, dependencies, quantity limits, contract ≥ each product's minimum, price within catalogue range per line. Used as a gate and in tests.

### 5.5 Toggles
- `toggle_on(product)`: add, close dependencies, report `auto_added`, show price/setup/contract/ETA deltas.
- `toggle_off(product)`: remove, cascade-remove dependents whose prerequisites vanished, report `auto_removed`, show deltas, warn before removal.
- Add-ons default OFF.

---

## 6. SIMILAR CUSTOMERS AND ANALYTICS

### 6.1 Training data and label weights
- Learn from activated leads; if quote-accepted/KYC-complete leads have a known bundle, include them with lower weight (config; default activated-retained 1.0, activated-churned 0.7 for popularity but penalise in retention, accepted-not-activated 0.5). Process failures (dropped at KYC/install) are NOT bundle failures.
- Retention and NPS come from activated leads only.
- **Time split for evaluation**: train on created_date < 2026-06-01, test on ≥ 2026-06-01. Statistics used in evaluation are built from train only (no leakage).
- Never use post-recommendation columns (outcome, stage, drop_reason, dates, churn, NPS) as features of the customer being advised; only for building cohort statistics.

### 6.2 Cohort with back-off
Match order: segment + city_tier + num_sites + employee band + gstin → drop employee band → drop tier → drop gstin → segment only → all. Stop at the first level with n ≥ MIN_COHORT (default 30). Always return `{level_used, n}` for transparency.

### 6.3 Statistics per cohort
Product attach rate; exact-bundle frequency (top 15); product-pair lift; churn per product/bundle with shrinkage `(sum+k*base)/(n+k)`, k=5; mean NPS per product with shrinkage; spend ratio; price position `t`; contract distribution and churn by contract; quantity stats.
Only show a percentage to the user when n ≥ MIN_SAMPLE (default 20); else use segment-wide and say so.

---

## 7. RECOMMENDER

### 7.1 Pipeline
candidates → eligibility → dependency closure → quantities → price → score → MMR diversity → top-2 → add-ons → reason codes → explanation.

### 7.2 Candidate generation
1. **Need-based builds** for stated needs: for each need category choose per strategy → **Lean** (cheapest eligible per need), **Best fit** (highest cohort attach per need), **Complete** (Best fit + top attached extras).
2. **Proven bundles**: top exact bundles in the cohort, filtered/closed by rules, plus Best-fit products for any uncovered need.
3. Dedupe by product set; every candidate passes the validator.

### 7.3 Scoring (weights in config; tune by backtest)
Default: need coverage 0.35, budget fit 0.25, retention (1−churn) 0.15, popularity 0.15, NPS 0.10.
- **Need coverage** = |needs covered| / |needs| (expected needs also from `products_of_interest` patterns).
- **Popularity of a bundle** = mean attach rate of its products in cohort (exact-bundle counts are too sparse).
- **Budget fit** = `1 − min(1, |effective_monthly − target| / target)`, where effective_monthly = monthly + setup / contract_months and target = current_spend × cohort spend_ratio. If spend unknown, use cohort median bundle value.
- **Retention** = 1 − mean shrunk churn; **NPS** = mean shrunk NPS / 10.
- Pure popularity is a baseline only, never the ranking.

### 7.4 Diversity re-ranking (MMR) for top-2
Pick #1 by score. For #2 pick the highest-scoring candidate with Jaccard(product set vs #1) < 0.8 (config) or a different price tier/purpose. Label them e.g. **Recommended** and **Budget alternative / Essentials**, with a one-line contrast ("cheaper, no WhatsApp"). If only one distinct valid bundle exists (e.g. no GSTIN), return one and explain what unlocks more.

### 7.5 Coverage and diversity metrics (computed in evaluation)
- **Need coverage** per bundle; **catalogue coverage** (share of products ever recommended); **recommendation coverage** (distinct top-1 bundles / leads); **top-2 diversity** (mean 1 − Jaccard); **novelty** (how often top-1 is NOT the single most popular bundle in cohort); **calibration** of acceptance likelihood if modelled.

---

## 8. QUOTE, PRICE, SETUP, CONTRACT, ADD-ONS

### 8.1 Line items
`unit_price = price_min + t × (price_max − price_min)`, `t` = cohort/segment median price position (config fallback 0.5 only if no data, flagged). `monthly_line = unit_price × qty`. Setup per catalogue (document assumption: per unit × qty or once; verify against `one_time_setup_inr` in activated leads and pick the one that reproduces history).

### 8.2 Display (always separate)
- **Monthly recurring total**, **one-time setup**, **contract length**, **tax line** (configurable rate/flag; state whether catalogue prices are tax-inclusive), optional **first-year total** = setup + 12 × monthly (+ tax).
- Never fold setup into the monthly price.

### 8.3 Contract co-terming
Bundle contract = **max(min_contract_months)** of all included products. If an add-on raises it, show: "Adding CCTV makes your contract 24 months." Never go below a product's minimum. Offer a longer term only if the catalogue allows and data shows lower churn for it. No invented discounts.

### 8.4 Install / activation ETA
Default = **max(typical_install_days)** across products (parallel install). If a product activates only after its prerequisite, add times along that dependency chain. Calibrate with real `days_lead_to_activation` vs catalogue (report the gap; add a configured buffer). ETA updates on every toggle and feeds the tracker.

### 8.5 Add-ons (three tiers)
1. **Required (dependency)** — auto-included, labelled, priced.
2. **Recommended** — eligible products not in bundle that still validate after closure; rank by (a) unmet stated needs, (b) cohort lift, (c) retention effect; show 3–5 max, one reason each.
3. **Optional upgrades** — below the fold.
Each add-on shows: monthly delta, setup delta, contract effect, ETA effect, `also_adds` (prerequisites it drags in). Default OFF; no pre-ticked boxes (dark-pattern guideline). Offer timing: some at quote, some at checkout, some post-activation (lifecycle nudges, backlog item).

---

## 9. EXPLAINABILITY

1. Engine records **reason codes** with facts: `NEED_MATCH(covered, missing)`, `DEPENDENCY(auto_added, for)`, `PEER_POPULARITY(pct, n, cohort_level)`, `BUDGET(price, current_spend, typical_ratio)`, `RETENTION(churn, n)`, `EXCLUSION(product, reason)`.
2. Select top 2–3 reasons: always (a) the owner's own stated needs, (b) one peer/evidence reason only if n ≥ MIN_SAMPLE, (c) a budget-honesty line when price > current spend, (d) any surprise (auto-added dependency, exclusion).
3. LLM writes 60–100 words in the owner's language, using ONLY provided numbers/products; no discounts, no guarantees.
4. **Grounding check**: every ₹ amount, quantity, % and product name in the text must exist in the structured result; else regenerate once, else use a fixed template built from reason codes.
5. Wording: "commonly chosen by clinics like yours", never "best for you".
6. Log inputs, rule/catalogue version, reason codes, output (audit).

---

## 10. ADVISOR (chat/voice front end)

- Slot extraction JSON matching the profile schema; null when not stated; never guess. Handles Hindi, English, Hinglish and spelling variation.
- Ask ONE question at a time, only what changes the recommendation; offer tap options; confirm extracted facts back to the user.
- Minimum fields before recommending: segment/business_type, city (→tier), employee_count, num_sites, needs; ask GSTIN/Udyam; spend optional.
- Validate extraction with a schema; retry once; fall back to a form.
- Scope guard: never quote prices outside the engine; no legal/tax claims.
- **Prompt-injection safety**: user text and uploaded documents are untrusted; they cannot change rules/prices/instructions.
- **FAQ/RAG** over `docs/faq/*.md` (what is a leased line, consent, retention, install steps) — RAG is for help text only, never for choosing bundles.
- **Human handoff** with full transcript when asked or when no valid bundle exists → creates a back-office lead.
- Optional stretch: WhatsApp/voice front end calling the same API.

---

## 11. SMART KYC AND PRIVACY

### 11.1 Pipeline
1. **Consent screen first** (see 11.3).
2. Collect GSTIN/Udyam number (typed or from OCR).
3. **Format check** (GSTIN structure + checksum; Udyam pattern).
4. **Registry lookup** (mock APIs): status Active/Cancelled/Suspended; not found.
5. **Document OCR** via vision LLM → JSON for GST cert, Udyam cert, signatory ID, address proof.
6. **Cross-validation**: business name (GST vs Udyam vs ID/bill vs user input), address, PAN consistency, dates.
7. Decision with plain-language reasons and a re-upload path.

### 11.2 Matching rules
- **Normalise names**: lowercase, strip `M/s, Pvt, Private, Ltd, LLP, &, punctuation`, transliterate Hindi.
- Proprietorships: compare against `trade_name` and the text inside `(Prop. …)`.
- Fuzzy score = token-set / Jaro-Winkler style (rapidfuzz). **Three bands** (config): auto-pass ≥ 0.90, ask-to-confirm 0.75–0.90, reject/manual review < 0.75. Never auto-accept on name alone: combine with registry status + identifier match.
- Address: pincode exact, remaining text fuzzy; normalise abbreviations.
- Address proof age ≤ 90 days from 2026-07-15; flag expired IDs, blurry/rotated images, wrong document type, mismatched names, tampering signs.
- Cancelled/Suspended GSTIN → block sale of GSTIN-required products and offer the Udyam-only/no-GSTIN path or human help.
- **Test on all 12 applicants (K01–K12)**: build `kyc_eval.md` — table of expected problem vs detected. Judges hold an answer key, so aim for every planted problem caught and zero false rejections on clean applicants.

### 11.3 Consent and privacy (DPDP Act 2023 principles)
- Separate, unticked consents per purpose: KYC verification, service communications, marketing, partner sharing. Plain language in the owner's language; show what is collected and why, retention period, and how to withdraw.
- Data minimisation: collect only what each step needs; purpose limitation enforced in code (consent check before each purpose).
- `consent_log` (user, purpose, text version, timestamp, language, withdrawn_at).
- Mask identifiers in UI and logs (show last 4); never log raw document text; encrypt documents at rest; role-based access; audit log.
- **Redact identifiers before sending text to the LLM** wherever possible; document processing locations.
- Retention: configurable (e.g. documents deleted N days after activation/abandonment); implement a purge job; provide access/correction/erasure endpoints and grievance contact.
- Security: file-type/size limits, malware scan hook, rate limiting, protection against GSTIN enumeration.
- Do not claim legal compliance as certain; state "designed to the principles of DPDP; legal review needed before launch". Produce `docs/privacy_note.md` (1 page).

---

## 12. ORDER TRACKER

State machine: `Quote accepted → KYC pending → KYC verified → Payment/e-sign → Scheduled → Installing → Activated` (+ `On hold`, `Rejected`). Event log with timestamps; per-product install progress; **ETA from §8.4**; push/WhatsApp-style notifications (mock); "what's next" and "what I need to do" panel; escalate-to-human button. Goal: replace the 3 status-chase calls.

---

## 13. BACK-OFFICE

- **Unclosed leads**: advisor could not close (no valid bundle, KYC fail, quote drop) with transcript, profile, reason, suggested next action, assigned owner (field rep / partner).
- **Propensity score** (stretch): gradient boosting or logistic regression; target = activated; features = profile only (no post-creation columns), time split, report AUC and top-decile lift, show feature importances/SHAP per lead ("why call this lead").
- Insights page (§3), recommendation override log, partner attribution view.

---

## 14. EVALUATION HARNESS (`/eval`, one command, outputs `eval_report.md`)

1. **Hard gate**: run recommend() on ALL 5,000 leads (and synthetic edge profiles) → violations must be 0.
2. **Accuracy vs history** (time split, train-only stats), on activated test leads and separately on the wider set if bundles exist: hit@1, hit@2 (Jaccard ≥ 0.5), mean best Jaccard@2, NDCG/MRR if ranked list, add-on recall@5 (products bought but missing from top-1).
3. **Price**: % within ±25% of actual `monthly_bundle_value_inr`, MAPE; setup match; contract match.
4. **Beyond accuracy**: coverage, diversity, novelty, calibration (see §7.5).
5. **Baselines**: (a) most popular bundle in segment (after rules), (b) random eligible bundle. Engine must beat both.
6. **Ablation**: rules only → +cohort history → +multi-factor scoring → +MMR; table of contribution.
7. **Slice analysis**: per segment, city_tier, language, GSTIN status, size; flag slices where performance is much worse (esp. Micro = 55% of base).
8. **Scenario suite** (`tests/scenarios.yaml`, ≥ 20 cases with expected pass/fail, defined before running): no GSTIN; cancelled GSTIN; tier-2 city; single-site micro; multi-site wanting CCTV; need whose dependency is unsatisfiable; very low budget; 25+ employees (leased line); conflicting needs; spend unknown; Udyam-only; GSTIN toggle on/off diff; quantity edit; toggle cascade; contract co-term with CCTV; ETA chain.
9. **Grounding tests** for explanations (numbers/products exist in result).
10. Document known biases: history reflects what reps pitched; only buyers have bundles; one quarter of data.

### Online plan (document only, `docs/online_eval.md`)
A/B vs sales-led journey; staged rollout (shadow mode → pilot → scale); north-star: lead-to-activation conversion (7% → target 12–15%), time to activate (17.6 days → <5), CAC (₹15k → <₹8k), 6-month churn, status-chase calls (3 → <1); guardrails: complaint rate, KYC rejection rate, cancellation rate, override rate.

---

## 15. API CONTRACT (minimum)

- `POST /api/advisor/message` → `{reply, profile_partial, next_question, ready_to_recommend}`
- `POST /api/recommend` body: profile → `{options:[{label, products[], quote, score, score_breakdown, reasons[], explanation, addons[], excluded[], contract_months, install_eta_days}], cohort:{level,n}, diff_vs_previous?}`
- `POST /api/quote/toggle` `{bundle, product_id, on}` → `{bundle, quote, auto_added[], auto_removed[], contract_change?, eta_change?}`
- `POST /api/quote/quantity` `{bundle, product_id, qty}`
- `GET /api/lookup/gstin/{id}`, `GET /api/lookup/udyam/{id}` (masked responses)
- `POST /api/kyc/consent`, `POST /api/kyc/upload`, `GET /api/kyc/result/{id}`
- `POST /api/order`, `GET /api/order/{id}/status`
- `GET /api/insights/*`, `GET /api/backoffice/leads`, `GET /api/eval/report`
All responses validated by Pydantic models; errors are structured with codes.

---

## 16. UI SCREENS (mobile-first, EN/HI)

1. Advisor chat (tap options, voice stretch) + editable profile summary with **GSTIN / Udyam toggles**.
2. Two options side by side (Recommended vs alternative) with "Why this?" and what each excludes; locked-product hints.
3. Quote: line items with qty steppers, monthly total, setup, contract, tax, first-year total, ETA; add-on toggles with live deltas and cascade messages.
4. Consent screen → KYC upload → extraction review (user can correct) → validation result with plain reasons.
5. Order tracker.
6. Back-office: unclosed leads, propensity ranking, Insights, Eval report.
Accessibility: large tap targets, low-bandwidth friendly, no dark patterns (no pre-ticked extras, no fake urgency).

---

## 17. REPO LAYOUT

```
/config (columns.yaml, weights.yaml, thresholds.yaml, tax.yaml)
/data (raw CSVs, kyc_documents)
/db (alembic migrations, loaders, schema.sql)
/app/{api,data,stats,rules,recommender,pricing,explain,advisor,kyc,consent,orders,backoffice}
/ui
/eval
/tests (unit, scenarios.yaml, kyc_cases)
/docs (architecture.md, insights.md, privacy_note.md, online_eval.md, model_card.md, faq/)
ASSUMPTIONS.md  data_profile.md  README.md
```

---

## 18. BUILD ORDER (do each phase, run tests, report before moving on)

0. Data profile + load into Neon Postgres + insights endpoints + `docs/insights.md`.
1. Rules engine (eligibility, closure, quantities, validator, toggles) + tests.
2. Cohort stats + quantity/price-position/spend-ratio learning.
3. Pricing/quote (setup, contract co-term, ETA, tax).
4. Recommender (candidates, scoring, MMR, add-ons) + reason codes.
5. Evaluation harness + baselines + ablation + scenario suite → `eval_report.md`. Tune weights on TRAIN, report on TEST.
6. Explanation layer with grounding check and fallback.
7. Advisor (slot extraction, questions, handoff) + RAG FAQ.
8. KYC (checksum, registry, OCR, fuzzy, doc checks, consent) + `kyc_eval.md` on K01–K12.
9. Tracker + back-office + propensity.
10. UI polish, demo script (3 min), architecture diagram, privacy note, model card.

## 19. DEFINITION OF DONE
- 0 rule violations across all leads and the scenario suite.
- Engine beats both baselines on the time-split backtest; slice report produced.
- Every displayed number traces to catalogue or computed data; grounding tests pass.
- GSTIN/Udyam toggle diff works end to end; toggles cascade correctly; contract/ETA update live.
- KYC catches every planted problem for K01–K12 with plain-language messages.
- Privacy controls (consent, masking, redaction, retention) implemented and documented.
- Demo path (advisor → options → toggles → KYC → tracker → back-office) runs from the repo against Neon, with a `--offline` fallback that reads the CSVs if the DB is unreachable (demo-day safety).

---

## 20. DATABASE: NEON POSTGRES

The user has already connected a Neon Postgres project. Read `DATABASE_URL` (and `DATABASE_URL_DIRECT` if present) from `.env`; never print, log or commit it. Add `.env` to `.gitignore` and provide `.env.example`.

### Connection practice
- `sslmode=require` always.
- Use the **pooled** connection string for the API (many short requests) and the **direct** string for migrations and bulk loads.
- Neon can auto-suspend; the first query after idle is slow. Add a startup warm-up ping, short connect retries with backoff, and a `/health` endpoint that reports DB latency. Do a warm-up before any live demo.
- Use a small connection pool (e.g. 5) to stay within free-tier limits.
- Use a Neon branch (or a separate schema) for tests so tests never touch demo data.

### Schema (create with Alembic, typed columns, not all-text)
| Table | Notes |
|---|---|
| `products` | catalogue; `requires_one_of` also normalised into `product_dependencies(product_id, requires_product_id)`; tiers into `product_tiers`; index on `product_id` |
| `leads` | all columns typed (dates as DATE, booleans as BOOLEAN, spend as INT); indexes on `segment`, `city_tier`, `stage_reached`, `has_gstin`, `created_date` |
| `lead_bundle_items` | exploded from `bundle_products`: `(lead_id, product_id, qty)`; makes attach rates, co-purchase and quantity analytics plain SQL |
| `lead_interest_items` | exploded from `products_of_interest`: `(lead_id, product_id)` |
| `gstin_registry`, `udyam_registry` | typed dates (parse DD-MM-YYYY), unique index on the identifier, index on normalised trade/enterprise name |
| `kyc_cases`, `kyc_documents_meta` | extraction results, validation findings, decision, reasons; store only masked identifiers and file references |
| `consent_log` | append-only: user/session, purpose, consent text version, language, granted_at, withdrawn_at |
| `orders`, `order_events`, `order_lines` | state machine history, ETA, per-product progress |
| `rec_log` | profile snapshot (masked), catalogue/rules version, weights version, options shown, reason codes, toggles, outcome (audit + feedback loop) |
| `backoffice_leads` | unclosed leads with transcript reference, reason, owner, status |
| `cohort_stats` (optional cache) | precomputed cohort statistics keyed by cohort level and training cutoff; rebuild with a CLI command |

Data-quality checks run after loading: row counts match the README (25 / 5,000 / 3,534 / 2,723), funnel counts match, all `bundle_products` parse, every product ID in leads exists in `products`, every lead GSTIN/Udyam found in the registries or flagged. Write the results to `data_profile.md`.

### Access and security
- Two roles: `app_rw` (API) and `analytics_ro` (insights and evaluation, read-only). Do not use the owner role at runtime.
- No raw document images or full identifiers in the database: store files on disk/object storage with encryption and keep only references and masked values in tables. Registry tables are synthetic, so they may hold full numbers, but the API returns masked values.
- Parameterised queries only (no string-built SQL), including everywhere the LLM output could reach.
- Retention: a purge job deletes KYC cases and document references after the configured window, and `consent_log` is kept as the evidence record.
- Note in `docs/privacy_note.md` where the database is hosted (Neon region) and that DPDP cross-border and vendor questions would need review before launch.
- Evaluation and insights read from the DB but write only to files under `/eval` and to `cohort_stats`.

### Performance
- Do cohort aggregation in SQL (GROUP BY on `lead_bundle_items` joined to `leads`) or cache it in `cohort_stats`; the recommender must answer in well under a second after warm-up.
- Cache catalogue and rules in memory, with a version number that is stored in `rec_log`.