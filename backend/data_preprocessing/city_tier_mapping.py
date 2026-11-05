"""
=============================================================================
DATA PREPROCESSING: City-to-Tier Resolver (city_tier_mapping.py)
=============================================================================
Maps Indian cities to telecom network infrastructure tiers (Tier 1 vs Tier 2)
and states, based on precomputed city mappings.
=============================================================================
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "city_tier_mapping.json"


class CityTierService:
    def __init__(self):
        self.cities: Dict[str, Dict[str, Any]] = {}
        self.load_mapping()

    def load_mapping(self):
        """Loads city tier mappings from data/city_tier_mapping.json."""
        if DATA_FILE.exists():
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    entries = json.load(f)
                    for item in entries:
                        name = item.get("city", "").strip().lower()
                        if name:
                            self.cities[name] = item
            except Exception:
                pass

    def lookup(self, city_name: Optional[str]) -> Dict[str, Any]:
        """
        Looks up city tier for an Indian city.
        Returns: { city, city_tier: 1 | 2, state, matched: bool }
        """
        if not city_name or not isinstance(city_name, str):
            return {"city": None, "city_tier": 2, "state": None, "matched": False}

        cleaned = city_name.strip().lower()
        if cleaned in self.cities:
            record = self.cities[cleaned]
            return {
                "city": record.get("city"),
                "city_tier": int(record.get("tier", 2)),
                "state": record.get("state"),
                "matched": True
            }

        # Default fallback for unmapped cities in India
        return {"city": city_name, "city_tier": 2, "state": None, "matched": False}


city_tier_service = CityTierService()
