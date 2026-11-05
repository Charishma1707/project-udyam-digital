# RECOMMENDATION PIPELINE — FULL SPEC (companion to CLAUDE.md)

Build the complete recommender for Project Udyam Digital. CLAUDE.md has the global rules, data pack, database and other modules; this file defines the recommendation pipeline in implementation detail. If the two files disagree, ask or record an assumption in `ASSUMPTIONS.md`.

**Type:** hybrid, knowledge-based recommender.
- Knowledge-based: catalogue rules decide what is ALLOWED (eligibility, dependencies, quantities, prices).
- Need-based: the owner's stated needs decide what is RELEVANT.
- Lookalike (collaborative): similar past customers decide what USUALLY WORKS.

**Pipeline:** normalise input → eligibility → cohort → statistics → candidates → dependency closure + quantities → pricing → scoring → diversity top-2 → add-ons → quote assembly → reasons + explanation → interactive re-runs (toggles, what-if) → logging → evaluation.

All numbers in worked examples below are ILLUSTRATIVE. Compute real ones from the database. All thresholds and weights come from `config/*.yaml`.

---

## STAGE 0 — Input normalisation and profile validation

**Input:** `CustomerProfile` (see CLAUDE.md section 4). **Output:** `NormalisedProfile` plus a list of `missing_or_uncertain` fields.

Steps:
1. Normalise booleans, tiers (derive `city_tier` from city via a lookup built from leads; if the city is unknown ask), segment (from `business_type` via lookup + fuzzy match on known `business_type` values; keep a confidence score).
2. `gstin_valid_for_sale` = has_gstin AND registry status == Active. Cancelled/Suspended/not found → false, with `gstin_issue` recorded.
3. Map needs to catalogue categories. Maintain `config/need_map.yaml`: free-text/need tokens ("internet", "wifi", "email", "security", "whatsapp", "cctv", "pos", "leased line"...) → catalogue `category` values or product IDs. Build the first draft from the catalogue's `category` and `description` columns, and check it against `products_of_interest` in the leads.
4. Need weights: stated needs weight 1.0. Optional inferred needs (products with cohort attach rate ≥ `expected_need_threshold`, default 0.6) weight 0.5 — shown to the user as suggestions, not assumed.
5. Required fields before recommending: segment (or business_type), city_tier, employee_count, num_sites, at least one need. Optional: spend, turnover band, current internet/provider, Udyam. If a required field is missing return `ready=false` with the single most valuable next question.

**Tests:** Hinglish business types map to the right segment; unknown city triggers a question; cancelled GSTIN acts as no GSTIN.

---

## STAGE 1 — Hard-rule eligibility

Filter, never a weight. For every catalogue product evaluate:
- tier ∈ `available_city_tiers`
- employee_count ≥ `min_employees`
- num_sites ≥ `min_sites`
- NOT (`requires_gstin` = Y AND NOT gstin_valid_for_sale)

**Output per product:** `eligible: bool`, `reasons: [TIER_NOT_AVAILABLE | MIN_EMPLOYEES | MIN_SITES | NEEDS_GSTIN]`, `unlock_hint` when fixable (e.g. "unlocks with a valid GSTIN", "needs 2+ sites").

Rules:
- Keep all ineligible products with reasons. They feed the UI ("locked" cards), the explanation and the back-office.
- Compute `unlockable_with_gstin` = products that fail ONLY on NEEDS_GSTIN. This powers the GSTIN toggle diff.
- If a stated need has zero eligible products, record `NEED_UNMET(need, reasons)`; do not silently drop it.

**Tests:** property test — for random profiles, no ineligible product ever appears in any output.

---

## STAGE 2 — Similar-customer cohort (lookalike) with back-off

**Training set:** leads with a known bundle (see label rules in Stage 3). Evaluation mode uses train months only.

Match levels, strictest first (config `cohort_levels`):
1. segment + city_tier + num_sites band + employee band + gstin flag
2. drop employee band
3. drop city_tier
4. drop gstin flag
5. segment only
6. all training customers

Stop at the first level with weighted n ≥ `min_cohort` (default 30). Return `{level, n, filters}`. Bands (config): employees 1–5, 6–10, 11–25, 26–50, 51+; sites 1, 2–3, 4–10, 11+. Calibrate bands to the real distribution (quantile-based if distribution is skewed).

Rules:
- Report cohort level and n everywhere they influence a result. Percentages shown to users require n ≥ `min_sample` (default 20); otherwise fall back to the segment level and say so.
- Optional refinement: soft similarity weight instead of hard filters (e.g. Gower distance on mixed fields, weights per field from config), then take top-k nearest. Implement hard-filter back-off first; add the soft version only as an ablation experiment.

**Tests:** cohort never smaller than min after back-off unless the whole segment is smaller; level_used is logged; identical profiles give identical cohorts.

---

## STAGE 3 — Cohort statistics (analytics)

Computed once per (cohort definition, training cutoff) and cached in `cohort_stats`.

**Label weights** (config): activated and retained 1.0; activated and churned 0.7 for popularity (but their churn counts in retention); quote-accepted-not-activated 0.5, ONLY if their bundle is known (verify; otherwise they contribute acceptance patterns only). Dropped at KYC/installation is a process failure, not a bundle failure.

Statistics per cohort:
1. **Attach rate** per product = weighted share of cohort customers who bought it.
2. **Exact-bundle frequency** (top 15 bundles) for proven-bundle candidates.
3. **Pair lift** = P(B | A) / P(B) per product pair, with minimum support.
4. **Retention per product** = 1 − shrunk churn, `(churned + k·base) / (n + k)`, k = 5 (config). Same shrinkage for NPS: `(sum + k·base_nps)/(n + k)`.
5. **Spend ratio** = `monthly_bundle_value_inr / monthly_telecom_spend_inr` (median, p25, p75). Ignore rows where spend is 0/null.
6. **Price position t** per product mix: `t = (actual_value − Σ min·qty) / (Σ max·qty − Σ min·qty)` clipped to [0,1]; median per cohort/segment.
7. **Quantity rules** per product (Stage 5).
8. **Contract distribution** and shrunk churn by `contract_months`.
9. **Setup rule check**: test whether `one_time_setup_inr` equals Σ(setup × qty) or Σ(setup once per product) on activated leads; choose the rule with the lower error and record it.
10. **Install calibration**: for activated leads compare `activated_date − quote_accepted_date` with the ETA predicted from the bought products (Stage 10); store the median extra days as `eta_buffer_days`.
11. **Affordability ceiling**: p75 of spend ratio among quote-accepted leads, and the spend ratio of leads dropped at the quote stage with a price-related `drop_reason`. Used for the "stretch" flag in Stage 7.

**Tests:** shrinkage keeps tiny samples near the base rate; all statistics reproduce when rebuilt; no statistic uses leads created after the training cutoff in evaluation mode.

---

## STAGE 4 — Candidate generation

For the profile's eligible products and needs, build candidates from three families.

**A. Need-based builds**
- For each stated need category, choose one eligible product by strategy:
  - **Lean:** cheapest (`price_min`, tie-break lowest setup, then product_id).
  - **Best fit:** highest cohort attach rate (tie-break cheapest).
  - **Complete:** Best fit + top-N extras by cohort attach rate and lift (N = 2, config), extras must be eligible.
- If a category has several eligible products, choose among them by attach rate first; do not choose by price alone for Best fit.

**B. Proven bundles**
- Top exact bundles in the cohort, filtered by eligibility. Removed products are not replaced unless they were a need; uncovered needs get the Best-fit product for that need.

**C. Cohort-core bundle**
- The set of products with attach rate ≥ `core_threshold` (default 0.5) in the cohort, filtered by eligibility.

Dedupe by product set. Cap at `max_candidates` (default 40). Every candidate continues to Stage 5; none is shown before passing the validator.

**Tests:** every candidate set is drawn only from eligible products; no duplicates; candidate generation is deterministic.

---

## STAGE 5 — Dependency closure, quantities and validation

### 5a. Dependency closure
`requires_one_of` means at least one listed product must be present in the same bundle.
Algorithm:
1. Remove ineligible products from the set.
2. Repeat until stable: for each product with an unsatisfied requirement, choose the prerequisite from the ELIGIBLE, not-banned options by priority (already in bundle → higher cohort attach rate → cheaper → lower product_id). If none exists, drop the dependent product and ban it for this pass, recording `DEPENDENCY_UNSATISFIABLE`.
3. Record every auto-add (`auto_added_for = dependent`) and every drop with reason.
4. Chains (Security → Email → Broadband) resolve by iteration; the banned set prevents loops.

### 5b. Quantities (learned)
For each product learn the driver from activated bundles (`P01x2` parsed into the `lead_bundle_items` table):
- If correlation(qty, num_sites) > `qty_corr_threshold` (0.5) and ≥ correlation with employees → per-site (qty = num_sites, bounded by catalogue limits).
- Else if correlation(qty, employee_count) > threshold → per-user: `qty = round(employee_count × median(qty/employees))`, min 1.
- Else the cohort/segment median qty (min 1).
- Respect catalogue-implied limits (e.g. seats of a dependent product ≤ seats of its prerequisite if `unit` implies seats; verify per product, document in `ASSUMPTIONS.md`).
- Quantities are PRE-FILLED and editable by the owner (stepper). After an edit re-run validation and pricing.
- If the owner states a number ("12 staff need email"), it overrides the learned value.

### 5c. Validator (`validate_bundle`)
Checks: eligibility of every product, dependencies satisfied, quantity limits, contract ≥ each product's minimum, unit price within [price_min, price_max], no duplicate products, at least one product. Returns a list of violation codes. A bundle with any violation is discarded (in the pipeline) or raises an error (in the API) — it is NEVER displayed.

**Tests:** chain closure; unsatisfiable dependency drops the product; cycles terminate; closure is idempotent (running it twice changes nothing); validator catches deliberately broken bundles; the property test from Stage 1 extended to dependencies.

---

## STAGE 6 — Pricing each candidate

- `unit_price = price_min + t × (price_max − price_min)`, `t` from the cohort price position (Stage 3.6); fall back to the segment, then to config `default_t` (flagged `PRICE_POSITION_FALLBACK`). Clamp to [price_min, price_max]; round to `price_rounding` (config, default ₹1).
- `line_monthly = unit_price × qty`; `monthly_total = Σ line_monthly`.
- `setup_total` using the setup rule chosen in Stage 3.9.
- `contract_months = max(min_contract_months)` over products (co-terming).
- `effective_monthly = monthly_total + setup_total / contract_months` (used only for comparison and budget fit; never shown in place of the real monthly price).
- `first_year_total = setup_total + 12 × monthly_total` (before tax).
- `eta_days` from Stage 10.

**Pricing validation (separate from recommendation validation):** reconstruct the price of each actual activated bundle using this model and report error versus `monthly_bundle_value_inr` and `one_time_setup_inr` (MAPE, share within ±15% / ±25%). If error is large, investigate (quantity rule, price position by product, segment) before tuning the recommender.

---

## STAGE 7 — Scoring

All components are in [0,1] (document any rescaling). Default weights (config; tune on TRAIN months only): need 0.35, budget 0.25, retention 0.15, popularity 0.15, NPS 0.10.

- **Need coverage** = Σ weight(need) for covered needs / Σ weight(all needs). A need is covered if at least one product in its category is in the bundle.
- **Popularity** = mean attach rate of the bundle's products in the cohort, divided by the maximum value among current candidates (so large bundles are not penalised just for averaging more products).
- **Retention** = 1 − mean shrunk churn of the bundle's products (use the exact-bundle value when n ≥ `min_sample`).
- **NPS** = mean shrunk NPS / 10.
- **Budget fit:** target = spend × cohort spend ratio (median); if spend unknown use cohort median `monthly_bundle_value_inr`. Relative gap = (effective_monthly − target)/target. `fit = 1 − min(1, penalty × |gap|)` where penalty = `over_penalty` (default 1.0) for gap > 0 and `under_penalty` (default 0.5) for gap < 0 (overpaying hurts conversion more than underspending). No penalty inside a ±`budget_tolerance` band (default 10%).
- **Stretch flag:** if the bundle's spend ratio exceeds the affordability ceiling (Stage 3.11) set `stretch=true`; it is still shown, but the explanation must mention it and the second option should be cheaper.
- Optional small complexity penalty per product beyond `complexity_free_products` (default 4), for micro segment only (config; ablate it).

`score = Σ weight × component`. Tie-break: higher need coverage → lower effective_monthly → lexicographic product set. Store the full component breakdown. Pure popularity is a BASELINE ONLY, never the ranking.

**Tests:** weights sum to 1; scores deterministic; a bundle missing a stated need cannot outrank an otherwise identical bundle that covers it; unit tests for each component edge case (unknown spend, n below min sample, zero candidates).

---

## STAGE 8 — Diversity re-ranking and top-2

1. Option A = highest score.
2. Option B chosen by maximal marginal relevance: `mmr = λ·score − (1−λ)·max_similarity_to_A`, λ = 0.7 (config), with similarity = Jaccard of product sets. Hard constraint: Jaccard(A, B) < `max_overlap` (0.8) or a different contract/price tier.
3. Purpose-aware preference: if A is stretch or above target, prefer a cheaper B ("Budget alternative"); if A is well below target and the cohort buys more, prefer a richer B ("Growth option"). Label each option by purpose, plus a one-line contrast listing what B excludes or adds.
4. If only one distinct valid bundle exists (e.g. no GSTIN), return one, with `why_single` and the unlock hints.
5. Never pad with a near-copy to reach two.

**Tests:** top-2 always differ per the rule; B never violates the validator; with a no-GSTIN profile where all candidates collapse, exactly one option is returned with an explanation.

---

## STAGE 9 — Add-ons

For the chosen option, build the add-on list:
1. Candidates: eligible products not in the bundle.
2. For each, run closure on `bundle ∪ {addon}`. If the add-on is dropped, exclude it. Otherwise record `also_adds` (prerequisites pulled in).
3. Tier:
   - **Required:** produced by dependency closure (already in the bundle, labelled).
   - **Recommended:** meets a stated need not yet covered, or cohort lift ≥ `addon_min_lift` (1.2) with n ≥ min support. Show at most 5, with one reason each.
   - **Optional upgrades:** the rest, collapsed.
4. Rank recommended add-ons: `0.40·unmet_need + 0.30·normalised_lift + 0.15·retention_delta + 0.15·budget_headroom`, where budget_headroom = max(0, 1 − (new_effective_monthly − target)/target) bounded to [0,1].
5. For each add-on compute and return: `monthly_delta`, `setup_delta`, `contract_change` (if it raises the co-termed contract), `eta_change`, `also_adds`, `reason_code`.
6. All add-ons default OFF. No pre-ticked boxes, no fake urgency.
7. Timing metadata: `offer_stage` ∈ {quote, checkout, post_activation} for a later nudge feature.

**Add-on recall test:** for activated test leads, products actually bought but absent from top-1 should appear in the add-on list (recall@5).

---

## STAGE 10 — Quote assembly (display model)

Return separately: line items (product, unit price, qty, monthly), **monthly recurring total**, **one-time setup**, **contract months**, **tax line** (config: rate and whether catalogue prices include tax), **first-year total**, **ETA**.

- **Contract (co-terming):** max of all included products' minimum contract. When a toggle raises it, return `contract_change = {from, to, caused_by}`. Alternative terms: offer only terms observed in leads (`contract_months`) that are ≥ the minimum, where data shows lower shrunk churn with n ≥ min_sample AND the price effect is defined by catalogue data. Do not invent discounts; if the data shows no price difference by term, offer only the minimum term.
- **ETA:** each product's `typical_install_days`. For a product whose prerequisite must be active first, finish(p) = install_days(p) + max(finish(prereq in bundle)); otherwise finish(p) = install_days(p). `eta_days = max(finish) + eta_buffer_days` (from Stage 3.10). Return the critical-path product for transparency.
- Never fold setup into monthly. Never show a price that cannot be recomputed from catalogue rules + stored statistics.

---

## STAGE 11 — Reason codes and explanation

**Engine output (always):** reason objects, each with a code and facts:
- `NEED_MATCH {covered, missing}`
- `DEPENDENCY {auto_added, for}`
- `PEER_POPULARITY {pct, n, cohort_level}` (only if n ≥ min_sample)
- `BUDGET {price, current_spend, typical_ratio, stretch}`
- `RETENTION {churn_pct, n}` (internal; user-facing only as "customers like you tend to stay")
- `EXCLUSION {product, reason, unlock_hint}`
- `CONTRAST {vs_option, differences}`

**Selection:** always the owner's own stated needs first; one evidence reason only if n ≥ min_sample; a budget honesty line when price > spend or `stretch`; any surprise (auto-added dependency, exclusion). Maximum three reasons in the headline, rest under "details".

**LLM generation:** input = profile (redacted), chosen bundle, selected reasons. Instructions: language = owner's; 60–100 words; only provided numbers/products; mention price, setup, contract; one honest trade-off; no discounts, guarantees or "best". Wording "commonly chosen by businesses like yours", never "best for you".

**Grounding check:** extract every ₹ amount, quantity, percentage and product name from the text; each must exist in the structured data; else regenerate once, then use the deterministic template. Banned phrases list in config. Log which path produced the text (`llm` or `template`).

**Tests:** injected fake numbers are caught; template fallback always renders; no reason mentions a percentage when n < min_sample.

---

## STAGE 12 — Interactive re-runs (toggles, quantity edits, GSTIN/Udyam what-if)

All re-runs call the same validator and pricing code.

- **toggle_on(product):** add + closure → return `auto_added`, quote deltas (monthly, setup, contract, ETA).
- **toggle_off(product):** remove + prune dependents whose prerequisites vanished → return `auto_removed` and deltas; the UI warns BEFORE confirming when removal cascades.
- **quantity edit:** re-validate (limits), re-price, return deltas.
- **what_if(profile, changes)** for GSTIN, Udyam, tier, sites, employees: re-run the whole pipeline and return a diff: `{products_unlocked, products_locked, option_changes, price_change, new_exclusions, message}`, e.g. "With a valid GSTIN, 2 more products unlock: …". GSTIN false removes GSTIN-only products and any dependents; Udyam changes the KYC path and (where relevant) segment confirmation, as defined in CLAUDE.md.
- Re-running the recommendation after profile edits must keep manual add-on choices that remain valid and tell the user which ones were dropped and why.

**Tests:** toggle on → off returns the original bundle and price; cascade removal messages; what-if diff correctness against a brute-force recompute; idempotence.

---

## STAGE 13 — Logging and feedback

Write one `rec_log` row per recommendation: masked profile snapshot, catalogue hash/version, config/weights version, cohort level and n, candidates considered (ids + scores), options shown, reason codes, explanation path (llm/template), then later events (toggles, quantity edits, acceptance, abandonment stage, outcome). Used for audit, offline replay (re-run a logged profile on a new rules version) and the feedback loop. No raw identifiers or document text in logs.

---

## STAGE 14 — Evaluation (one command, writes `eval_report.md`)

1. **Hard gate:** run the full pipeline on all 5,000 leads plus synthetic edge profiles; violations must be 0 (eligibility, dependencies, quantity limits, contract, price range).
2. **Pricing validation** (Stage 6).
3. **Accuracy vs history** (time split: train created_date < 2026-06-01, test ≥ 2026-06-01, statistics from train only): hit@1, hit@2 (Jaccard ≥ 0.5), mean best Jaccard@2, NDCG/MRR if a ranked list is produced, add-on recall@5, price within ±25% and MAPE, contract match. Report separately for activated-only and, if bundles exist, quote-accepted leads.
4. **Beyond accuracy:** need coverage; catalogue coverage; recommendation coverage (distinct top-1 bundles per lead); top-2 diversity (mean 1 − Jaccard); novelty (top-1 ≠ cohort's single most popular bundle); calibration if an acceptance probability is modelled.
5. **Baselines:** popular-in-segment (after rules) and random eligible (seeded). Engine must beat both on hit@1/hit@2.
6. **Ablation table:** rules only → + cohort popularity → + need coverage → + budget/retention/NPS → + MMR.
7. **Slice analysis:** per segment, city tier, language, GSTIN status, employee band, num_sites; flag slices below overall performance by more than `slice_alert_gap` (config).
8. **Scenario suite** (`tests/scenarios.yaml`, ≥ 25 cases with expected outcomes written BEFORE running): no GSTIN; cancelled GSTIN; tier-2 city; single-site micro; multi-site with CCTV; unsatisfiable dependency; very low budget; 25+ employees (leased line); conflicting needs; spend unknown; Udyam-only; GSTIN toggle diff; toggle cascade; contract co-term; ETA chain; quantity edit; single-option return; Hinglish extraction; prompt-injection attempt in free text.
9. **Grounding tests** for explanations; **latency test** (recommend p95 < 500 ms after warm-up, excluding the LLM text step).
10. **Weight tuning:** grid or Bayesian search on TRAIN only, report TEST; record chosen weights in `config/weights.yaml` with the date.
11. Document known biases: history reflects what reps pitched; only buyers have bundles; one quarter of data; correlation is not causation.

---

## OUTPUT CONTRACT (`POST /api/recommend`)

```json
{
  "ready": true,
  "profile_used": {"segment": "Professional offices", "city_tier": 1, "employee_count": 6, "num_sites": 1, "gstin_valid_for_sale": true, "needs": ["internet","email","security","whatsapp"]},
  "cohort": {"level": 1, "n": 38, "filters": ["segment","tier","sites","employee_band","gstin"]},
  "options": [
    {
      "label": "Recommended",
      "purpose": "covers_all_needs",
      "products": [{"product_id": "<id>", "name": "<name>", "qty": 1, "unit_price": 0, "monthly": 0, "auto_added_for": null}],
      "quote": {"monthly_total": 0, "setup_total": 0, "contract_months": 12, "tax": {"rate": 0, "amount": 0, "inclusive": false}, "first_year_total": 0, "eta_days": 0, "eta_critical_path": "<product_id>"},
      "score": 0.0,
      "score_breakdown": {"need": 0, "budget": 0, "retention": 0, "popularity": 0, "nps": 0},
      "stretch": false,
      "reasons": [{"code": "NEED_MATCH", "facts": {}}],
      "explanation": {"text": "…", "language": "hi", "source": "llm|template"},
      "addons": {"required": [], "recommended": [{"product_id": "<id>", "monthly_delta": 0, "setup_delta": 0, "contract_change": null, "eta_change": 0, "also_adds": [], "reason": {}}], "optional": []},
      "excluded": [{"product_id": "<id>", "reasons": ["MIN_SITES"], "unlock_hint": "needs 2+ sites"}]
    }
  ],
  "single_option_reason": null,
  "unlockable": {"with_gstin": ["<product_id>"]},
  "warnings": ["PRICE_POSITION_FALLBACK"],
  "versions": {"catalogue": "<hash>", "config": "<hash>", "stats_cutoff": "2026-05-31"}
}
```
All numbers above are placeholders; real values come from the engine. Validate responses with Pydantic.

---

## MODULE LAYOUT

```
app/recommender/
  needs.py        # Stage 0 need mapping, weights
  eligibility.py  # Stage 1
  cohort.py       # Stage 2 back-off
  stats.py        # Stage 3 statistics and caching
  candidates.py   # Stage 4
  closure.py      # Stage 5a
  quantity.py     # Stage 5b
  validator.py    # Stage 5c
  pricing.py      # Stage 6 and 10 (co-term, ETA, tax)
  scoring.py      # Stage 7
  diversify.py    # Stage 8
  addons.py       # Stage 9
  toggles.py      # Stage 12
  reasons.py      # Stage 11 reason codes
  explain.py      # Stage 11 LLM + grounding + template
  pipeline.py     # orchestrates all stages
  logging.py      # Stage 13
eval/             # Stage 14 harness
tests/            # unit, property, scenarios.yaml
config/           # weights.yaml, thresholds.yaml, need_map.yaml, tax.yaml, columns.yaml
```

### Config keys and defaults (all tunable)
`min_cohort 30, min_sample 20, shrinkage_k 5, expected_need_threshold 0.6, core_threshold 0.5, max_candidates 40, qty_corr_threshold 0.5, weights {need .35, budget .25, retention .15, popularity .15, nps .10}, over_penalty 1.0, under_penalty 0.5, budget_tolerance 0.10, mmr_lambda 0.7, max_overlap 0.8, addon_min_lift 1.2, addon_max_shown 5, price_rounding 1, default_t 0.5 (fallback only), label_weights {activated_retained 1.0, activated_churned 0.7, accepted_not_activated 0.5}, slice_alert_gap 0.10`.

---

## COMMON FAILURE MODES TO AVOID
- Using post-recommendation columns (outcome, stage, drop_reason, dates, churn, NPS) as features of the person being advised (leakage). They are only for building cohort statistics.
- Letting the second option be a near-copy of the first.
- Ranking by popularity alone.
- Hiding locked products instead of explaining how to unlock them.
- Showing percentages for tiny cohorts.
- Treating process drops (KYC/installation) as bundle failures.
- Folding setup into the monthly price, or hiding tax.
- Letting the LLM state a number that is not in the data.
- Hard-coding column names, thresholds or weights.
- Tuning weights on test data.

---

## PHASED DELIVERY (acceptance criteria)

| Phase | Build | Accept when |
|---|---|---|
| R0 | Data profile, DB tables incl. exploded bundle/interest tables, statistics queries | Counts match README; stats reproduce |
| R1 | Stages 0–1, 5a, 5c (eligibility, closure, validator) | Property tests pass; 0 violations on all leads |
| R2 | Stages 2–3, 5b (cohort, stats, quantities) | Back-off and shrinkage tests pass; stats cached |
| R3 | Stages 6, 10 (pricing, co-term, ETA) | Price reconstruction error reported; ETA buffer calibrated |
| R4 | Stages 4, 7, 8 (candidates, scoring, MMR) | Beats both baselines on the time-split backtest; top-2 diversity verified |
| R5 | Stage 9, 12 (add-ons, toggles, what-if) | Toggle round-trip and what-if brute-force tests pass; add-on recall@5 reported |
| R6 | Stages 11, 13 (reasons, explanation, logging) | Grounding tests pass; template fallback verified; logs masked |
| R7 | Stage 14 (full evaluation, tuning, slices, scenarios) | `eval_report.md` generated; every gate in Definition of Done met |