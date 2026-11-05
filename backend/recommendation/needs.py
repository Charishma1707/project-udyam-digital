"""
Stage 0: Input Normalisation and Need Mapping (needs.py)
Normalises customer profile inputs, maps free-text need tokens to categories/products,
and evaluates gstin_valid_for_sale.
"""

from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
import yaml
from database.db_client import db_client
from data_preprocessing.business_segment_mapper import business_segment_mapper
from data_preprocessing.city_tier_mapping import city_tier_service

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BASE_DIR / "config"

_need_map_cache: Optional[Dict[str, Any]] = None


def load_need_map() -> Dict[str, Any]:
    global _need_map_cache
    if _need_map_cache is None:
        need_file = CONFIG_DIR / "need_map.yaml"
        if need_file.exists():
            with open(need_file, "r", encoding="utf-8") as f:
                _need_map_cache = yaml.safe_load(f) or {}
        else:
            _need_map_cache = {"keyword_to_category": {}, "keyword_to_products": {}}
    return _need_map_cache


def normalise_profile(raw_profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalises input profile:
    - Resolves segment from business_type if missing
    - Derives city_tier from city if missing
    - Checks GSTIN registry for gstin_valid_for_sale
    - Maps stated needs to categories and products
    """
    profile = dict(raw_profile)

    # 1. Segment resolution
    b_type = profile.get("business_type") or ""
    segment = profile.get("segment")
    if not segment or segment == "None":
        seg_res = business_segment_mapper.resolve(b_type)
        segment = seg_res["segment"]
        profile["segment"] = segment
        profile["segment_confidence"] = seg_res.get("confidence", 0.6)
    else:
        profile["segment_confidence"] = 1.0

    # 2. City tier derivation
    city = profile.get("city") or ""
    city_tier = profile.get("city_tier")
    if city_tier is None and city:
        tier_info = city_tier_service.lookup(city)
        if tier_info.get("matched"):
            city_tier = tier_info.get("city_tier")
            profile["city_tier"] = city_tier
            if not profile.get("state"):
                profile["state"] = tier_info.get("state")
    if city_tier is None:
        city_tier = 1
        profile["city_tier"] = city_tier

    # 3. Numeric defaults
    emp = profile.get("employee_count")
    profile["employee_count"] = int(emp) if emp not in [None, ""] else 5

    sites = profile.get("num_sites")
    profile["num_sites"] = int(sites) if sites not in [None, ""] else 1

    # 4. GSTIN validity check
    has_gstin_flag = str(profile.get("has_gstin") or "").strip().upper() in ["Y", "TRUE", "1", "YES"]
    gstin_str = str(profile.get("gstin") or "").strip().upper()
    gstin_issue = None
    gstin_valid_for_sale = False

    if has_gstin_flag or gstin_str:
        if gstin_str:
            rec = db_client.find_gstin(gstin_str)
            if not rec:
                gstin_issue = "NOT_FOUND"
                gstin_valid_for_sale = False
            elif str(rec.get("status", "")).strip().lower() in ["cancelled", "suspended"]:
                gstin_issue = rec.get("status", "Cancelled").upper()
                gstin_valid_for_sale = False
            else:
                gstin_valid_for_sale = True
        else:
            # Stated has_gstin=Y but no number provided yet -> treat as valid for sales estimation
            gstin_valid_for_sale = True

    profile["has_gstin_bool"] = has_gstin_flag or bool(gstin_str)
    profile["gstin_valid_for_sale"] = gstin_valid_for_sale
    profile["gstin_issue"] = gstin_issue

    # 5. Need mapping
    raw_needs = profile.get("needs") or []
    if isinstance(raw_needs, str):
        raw_needs = [n.strip() for n in raw_needs.split(";") if n.strip()]

    need_map = load_need_map()
    kw_to_cat = need_map.get("keyword_to_category", {})
    kw_to_prods = need_map.get("keyword_to_products", {})

    mapped_categories = set()
    mapped_product_ids = set()
    stated_needs_clean = []

    for item in raw_needs:
        token = str(item).strip().lower()
        if not token:
            continue
        stated_needs_clean.append(token)

        # Direct category or product ID match
        token_upper = token.upper()
        if token_upper in [p["product_id"] for p in db_client.get_products()]:
            mapped_product_ids.add(token_upper)
            for p in db_client.get_products():
                if p["product_id"] == token_upper:
                    mapped_categories.add(p["category"])

        # Keyword mapping
        for kw, cat in kw_to_cat.items():
            if kw in token:
                mapped_categories.add(cat)
        for kw, p_ids in kw_to_prods.items():
            if kw in token:
                for pid in p_ids:
                    mapped_product_ids.add(pid)

    # Fallback: if no specific category matched, default to Connectivity
    if not mapped_categories and not mapped_product_ids:
        mapped_categories.add("Connectivity")

    profile["needs_raw"] = stated_needs_clean
    profile["mapped_categories"] = list(mapped_categories)
    profile["mapped_product_ids"] = list(mapped_product_ids)

    return profile


def validate_profile_readiness(profile: Dict[str, Any]) -> Tuple[bool, List[str], Optional[str]]:
    """
    Checks required fields: segment/business_type, city_tier, employee_count, num_sites, needs.
    Returns: (ready: bool, missing_fields: list, next_question: str)
    """
    missing = []
    if not profile.get("business_type") and not profile.get("segment"):
        missing.append("business_type")
    if profile.get("city_tier") is None and not profile.get("city"):
        missing.append("city")
    if profile.get("employee_count") is None:
        missing.append("employee_count")
    if profile.get("num_sites") is None:
        missing.append("num_sites")
    if not profile.get("needs_raw") and not profile.get("needs"):
        missing.append("needs")

    ready = len(missing) == 0
    next_question = None

    if not ready:
        first = missing[0]
        prompts = {
            "business_type": "What type of business do you operate (e.g. retail shop, clinic, CA firm, factory)?",
            "city": "Which city is your business located in?",
            "employee_count": "How many employees or team members work at your business?",
            "num_sites": "How many branch locations or office sites do you operate?",
            "needs": "What telecom or IT solutions do you need (e.g., high-speed broadband, CCTV, cloud calling, POS)?"
        }
        next_question = prompts.get(first, "Could you share more details about your enterprise requirements?")

    return ready, missing, next_question

