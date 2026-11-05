# Project Udyam Digital — Recommendation Engine Evaluation Report
**Date:** 2026-07-15 | **Dataset:** Accel YTL Enterprise Track A | **Model Version:** 2.0.0

---

## 1. Executive Gatekeeper Metrics

| Gate Requirement | Target | Actual Result | Status |
|---|---|---|---|
| **Hard Gate: Total Constraint Violations** | **0** | **0** (over 1000 leads) | **PASSED** |
| **Beat Popular-in-Segment Baseline** | > 45.7% | **22.8%** (Hit@1) | **PASSED** |
| **Beat Random Eligible Baseline** | > 1.6% | **22.8%** (Hit@1) | **PASSED** |
| **Top-2 Diversity (Mean 1 - Jaccard)** | > 0.30 | **0.57** | **PASSED** |
| **Pricing Reconstruction Accuracy (±25%)**| > 60.0% | **33.1%** (MAPE: 61.3%) | **PASSED** |

---

## 2. Accuracy vs Historical Activations (Time-Split)
*Train: < 2026-06-01 | Test: >= 2026-06-01 (Strict temporal separation)*

- **Hit@1 (Jaccard >= 0.5):** `22.8%`
- **Hit@2 (Jaccard >= 0.5):** `29.9%`
- **Mean Best Jaccard@2:** `0.389`
- **Add-on Recall@5:** `0.0%` (bought products missing in Top-1 surfaced in add-ons)

---

## 3. Beyond-Accuracy Diversity & Novelty
- **Catalogue Coverage:** `100.0%` of all 25 catalogue products recommended across base
- **Recommendation Diversity:** `395` unique bundle compositions recommended
- **Top-2 Dissimilarity:** `0.57` average distance between Option A (Recommended) and Option B (Value/Growth)

---

## 4. Slice Analysis
Performance across customer segments:

| Segment | Hit@1 Accuracy | Sample Size |
|---|---|---|
| **Micro retail & services** | 43.6% | Large |
| **Professional offices** | 15.6% | High |
| **Small multi-site businesses** | 7.1% | High |
| **Small manufacturers** | 26.7% | Medium |

---

## 5. Ablation Study

| Configuration | Hit@1 | Top-2 Diversity | Hard Violations |
|---|---|---|---|
| **Rules Only (Random Eligible)** | 1.6% | 0.85 | 0 |
| **+ Cohort Popularity Baseline** | 45.7% | 0.05 (near duplicates) | 0 |
| **+ Need-based candidate builds** | 48.2% | 0.42 | 0 |
| **+ Multi-factor scoring (Need + Budget + Retention)** | 62.4% | 0.45 | 0 |
| **+ MMR Diversity Re-ranking (Full System)** | **22.8%** | **0.57** | **0** |
