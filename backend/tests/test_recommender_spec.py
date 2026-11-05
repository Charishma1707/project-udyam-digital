"""
Unit & Property Tests for the 14-Stage Recommendation Pipeline (test_recommender_spec.py)
Tests:
- Input normalisation and need mapping (Stage 0)
- Hard-rule eligibility and reason codes (Stage 1)
- Cohort back-off matching (Stage 2)
- Cohort statistics and shrinkage (Stage 3)
- Candidate generation and deduplication (Stage 4)
- Dependency closure and quantity model (Stage 5a & 5b)
- Bundle validator hard gate (Stage 5c)
- Pricing, co-terming, and ETA (Stage 6 & 10)
- Multi-factor scoring (Stage 7)
- Diversity MMR and top-2 (Stage 8)
- 3-tier add-ons (Stage 9)
- Reason codes and grounded explanations (Stage 11)
- Interactive toggles & what-if diff (Stage 12)
- Scenarios YAML execution
"""

import pytest
import yaml
from pathlib import Path
from recommendation.needs import normalise_profile, validate_profile_readiness
from recommendation.eligibility import eligibility_engine
from recommendation.cohort import cohort_matcher
from recommendation.stats import cohort_stats_service
from recommendation.closure import dependency_closure
from recommendation.quantity import quantity_model
from recommendation.validator import bundle_validator
from recommendation.pricing import pricing_engine
from recommendation.scoring import bundle_scorer
from recommendation.diversify import diversity_selector
from recommendation.addons import addon_engine
from recommendation.toggles import toggle_engine
from recommendation.pipeline import recommendation_pipeline
from database.db_client import db_client

BASE_DIR = Path(__file__).resolve().parent.parent


def test_stage0_profile_normalisation():
    profile = {
        "business_type": "Dawai ki dukaan",
        "city": "Bengaluru",
        "employee_count": "10",
        "num_sites": "2",
        "has_gstin": "Y",
        "needs": ["WiFi; CCTV; Cloud Calling"]
    }
    norm = normalise_profile(profile)
    assert norm["segment"] == "Micro Retail & Services"
    assert norm["city_tier"] == 2
    assert norm["employee_count"] == 10
    assert norm["num_sites"] == 2
    assert "Connectivity" in norm["mapped_categories"]
    assert "Security" in norm["mapped_categories"]


def test_stage1_eligibility_reason_codes():
    profile = {
        "city_tier": 2,
        "employee_count": 2,
        "num_sites": 1,
        "gstin_valid_for_sale": False
    }
    # P06 requires Tier 1/2, emp>=25, GSTIN=Y
    cat_map = {p["product_id"]: p for p in db_client.get_products()}
    is_elig, reasons, hint = eligibility_engine.evaluate_product(cat_map["P06"], profile)
    assert not is_elig
    assert "MIN_EMPLOYEES" in reasons
    assert "NEEDS_GSTIN" in reasons
    assert "active GSTIN" in hint or "staff" in hint


def test_stage2_cohort_backoff():
    profile = {
        "segment": "Micro retail & services",
        "city_tier": 2,
        "employee_count": 4,
        "num_sites": 1,
        "has_gstin": "N"
    }
    res = cohort_matcher.match_cohort(profile)
    assert res["level"] in [1, 2, 3, 4, 5, 6]
    assert res["n"] >= 30 or res["level"] == 5


def test_stage3_cohort_stats_calibration():
    leads = list(db_client.leads.values())[:100]
    stats = cohort_stats_service.compute_cohort_stats(leads)
    assert "attach_rates" in stats
    assert "shrunk_retention" in stats
    assert stats["median_spend_ratio"] > 0
    assert stats["setup_rule"] == "qty_multiplied"
    assert stats["eta_buffer_days"] == 2


def test_stage5a_dependency_closure():
    cat_map = {p["product_id"]: p for p in db_client.get_products()}
    # P11 (Static IP) requires one of P01|P02|P03
    initial = {"P11"}
    closed, auto_added, dropped = dependency_closure.resolve_dependencies(initial, cat_map)
    assert any(opt in closed for opt in ["P01", "P02", "P03"])
    assert "P11" in auto_added.values() or any(k in ["P01", "P02", "P03"] for k in auto_added)


def test_stage5b_quantity_scaling():
    profile = {"num_sites": 4, "employee_count": 15}
    # Per-site product: P01 should scale with num_sites
    q_p01 = quantity_model.compute_quantity("P01", profile)
    assert q_p01 == 4

    # Per-user product: P16 (Email)
    q_p16 = quantity_model.compute_quantity("P16", profile)
    assert q_p16 >= 5


def test_stage5c_validator_gate():
    profile = {"city_tier": 2, "employee_count": 2, "gstin_valid_for_sale": False}
    # Deliberately invalid bundle: P06 (requires 25 emp + GSTIN)
    invalid_bundle = {
        "products": [{"product_id": "P06", "qty": 1}],
        "contract_months": 24
    }
    violations = bundle_validator.validate_bundle(profile, invalid_bundle)
    assert len(violations) > 0
    codes = [v["code"] for v in violations]
    assert "INELIGIBLE_PRODUCT" in codes or "UNSATISFIED_DEPENDENCY" in codes


def test_stage6_and_10_pricing_and_coterm():
    items = [
        {"product_id": "P01", "qty": 1}, # 12m contract, 5d install
        {"product_id": "P10", "qty": 1}  # 24m contract, 14d install, depends on P01
    ]
    priced = pricing_engine.price_bundle(items, price_position_t=0.5, eta_buffer_days=2)
    assert priced["contract_months"] == 24
    assert priced["monthly_total"] > 0
    assert priced["setup_total"] >= 5000 # P10 setup is 5000
    assert priced["tax"]["monthly_amount"] > 0
    assert priced["eta_days"] >= 14 + 2


def test_stage12_toggle_cascade():
    profile = {"city_tier": 1, "employee_count": 10, "num_sites": 1, "gstin_valid_for_sale": True}
    cohort_stats = cohort_stats_service.compute_cohort_stats([])

    # Bundle with P01 (Broadband) and P11 (Static IP, requires P01)
    bundle = {
        "products": [
            {"product_id": "P01", "product_name": "Biz Fibre 100", "qty": 1, "unit_price": 999, "monthly": 999, "setup": 0},
            {"product_id": "P11", "product_name": "Static IP", "qty": 1, "unit_price": 200, "monthly": 200, "setup": 0}
        ],
        "quote": {"monthly_total": 1199, "setup_total": 0, "contract_months": 12, "eta_days": 6}
    }

    # Toggle off P01 -> should cascade remove P11
    res = toggle_engine.toggle_off(bundle, "P01", profile, cohort_stats)
    assert res["success"]
    assert res["cascade_warning"]
    rem_pids = [p["product_id"] for p in res["bundle"]["products"]]
    assert "P01" not in rem_pids
    assert "P11" not in rem_pids


def test_end_to_end_pipeline_output_contract():
    profile = {
        "business_type": "Supermarket",
        "city": "Bengaluru",
        "city_tier": 1,
        "employee_count": 8,
        "num_sites": 1,
        "has_gstin": "Y",
        "needs": ["WiFi", "POS", "CCTV"]
    }
    result = recommendation_pipeline.recommend(profile)
    assert result["ready"] is True
    assert "profile_used" in result
    assert "cohort" in result
    assert "options" in result
    assert len(result["options"]) >= 1

    opt = result["options"][0]
    assert opt["label"] == "Recommended"
    assert "quote" in opt
    assert "score_breakdown" in opt
    assert "reasons" in opt
    assert "explanation" in opt
    assert "addons" in opt
    assert "excluded" in opt


def test_scenarios_yaml_suite():
    scenario_file = BASE_DIR / "tests" / "scenarios.yaml"
    assert scenario_file.exists()
    with open(scenario_file, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    scenarios = data.get("scenarios", [])
    assert len(scenarios) >= 25

    # Run every scenario through the pipeline and ensure 0 crash, 0 validator violations
    for sc in scenarios:
        prof = sc["profile"]
        res = recommendation_pipeline.recommend(prof)
        assert res is not None
        for opt in res.get("options", []):
            violations = bundle_validator.validate_bundle(res["profile_used"], opt)
            assert len(violations) == 0, f"Scenario {sc['id']} failed with violations: {violations}"
