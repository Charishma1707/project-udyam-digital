"""
=============================================================================
DATA PREPROCESSING: Business Segment Mapper (business_segment_mapper.py)
=============================================================================
Deterministically resolves customer business descriptions into one of the 4
official Airtel Business MSME segments:
1. Micro Retail & Services
2. Professional Offices
3. Small Manufacturing
4. Multi-site Businesses

Prevents LLM hallucinations by using a fast 3-tier matching waterfall:
- Exact dictionary match against precomputed historical mappings
- Keyword & substring pattern matching
- Safe commercial fallback
=============================================================================
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional

MAPPING_FILE = Path(__file__).resolve().parent.parent / "data" / "business_type_mapping.json"

CANONICAL_SEGMENTS = [
    "Micro Retail & Services",
    "Professional Offices",
    "Small Manufacturing",
    "Multi-site Businesses",
]


class BusinessSegmentMapper:
    def __init__(self):
        self.exact_mapping: Dict[str, str] = {}
        self.load_mapping()

    def load_mapping(self):
        """Loads precomputed business type dictionary."""
        if MAPPING_FILE.exists():
            try:
                with open(MAPPING_FILE, "r", encoding="utf-8") as f:
                    self.exact_mapping = json.load(f)
            except Exception:
                pass

    def resolve(self, business_type: Optional[str]) -> Dict[str, Any]:
        """
        Resolves a business type string into a canonical segment.
        Returns: { segment: str, method: str, confidence: float }
        """
        if not business_type or not isinstance(business_type, str):
            return {"segment": "Micro Retail & Services", "method": "default", "confidence": 0.5}

        cleaned = business_type.strip().lower()

        # Tier 1: Exact match
        if cleaned in self.exact_mapping:
            return {"segment": self.exact_mapping[cleaned], "method": "exact", "confidence": 1.0}

        # Tier 2: Keyword rules
        keyword_rules = [
            (["bakery", "retail", "shop", "store", "salon", "restaurant", "cafe", "boutique", "grocery", "pharmacy", "clinic", "opticals", "supermarket"], "Micro Retail & Services"),
            (["ca firm", "law", "legal", "consult", "consulting", "consultancy", "agency", "software", "tech", "office", "accounting", "studio", "design"], "Professional Offices"),
            (["factory", "manufacturing", "textile", "mill", "workshop", "plant", "packaging", "plastics", "foundry"], "Small Manufacturing"),
            (["chain", "branches", "multi", "outlets", "franchise", "logistics", "courier"], "Multi-site Businesses")
        ]

        for keywords, segment in keyword_rules:
            for kw in keywords:
                if kw in cleaned:
                    return {"segment": segment, "method": "keyword", "confidence": 0.9}

        # Tier 3: Default fallback
        return {"segment": "Micro Retail & Services", "method": "fallback", "confidence": 0.6}


business_segment_mapper = BusinessSegmentMapper()
