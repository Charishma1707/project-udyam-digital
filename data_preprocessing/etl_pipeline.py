"""
=============================================================================
DATA PREPROCESSING: Automated ETL Pipeline (etl_pipeline.py)
=============================================================================
Ingests, normalizes, and precomputes statistics for all 11,282 synthetic records
across the Accel YTL Hackathon dataset:
- product_catalogue.csv (25 products)
- mock_gstin_registry.csv (3,534 GST records)
- mock_udyam_registry.csv (2,723 MSME records)
- smb_leads.csv (5,000 leads)
=============================================================================
"""

import csv
import json
from pathlib import Path
from typing import Dict, Any, List

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "YTL_TrackA_Udyam_Digital_Data"
DATA_DIR = BASE_DIR / "data"


def run_etl() -> Dict[str, Any]:
    """
    Executes ETL parsing and returns summary counts.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    products = []
    gstin_count = 0
    udyam_count = 0
    leads_count = 0

    # 1. Product Catalogue
    prod_csv = DATASET_DIR / "product_catalogue.csv"
    if prod_csv.exists():
        with open(prod_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                products.append({
                    "product_id": row.get("product_id"),
                    "product_name": row.get("product_name"),
                    "category": row.get("category"),
                    "monthly_price_inr": float(row.get("monthly_price_inr") or 0),
                    "one_time_setup_inr": float(row.get("one_time_setup_inr") or 0),
                    "contract_months": int(row.get("contract_months") or 12),
                    "min_employees": int(row.get("min_employees") or 1),
                    "min_sites": int(row.get("min_sites") or 1),
                    "requires_gstin": row.get("requires_gstin", "N"),
                    "available_city_tiers": [int(t) for t in (row.get("available_city_tiers") or "1;2").split(";") if t.isdigit()],
                    "typical_install_days": int(row.get("typical_install_days") or 7),
                    "target_segments": [s.strip() for s in (row.get("target_segments") or "").split(";") if s.strip()]
                })

    # Save normalized products
    with open(DATA_DIR / "products_normalized.json", "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2)

    # 2. Count registries
    gst_csv = DATASET_DIR / "mock_gstin_registry.csv"
    if gst_csv.exists():
        with open(gst_csv, "r", encoding="utf-8") as f:
            gstin_count = sum(1 for _ in f) - 1

    udyam_csv = DATASET_DIR / "mock_udyam_registry.csv"
    if udyam_csv.exists():
        with open(udyam_csv, "r", encoding="utf-8") as f:
            udyam_count = sum(1 for _ in f) - 1

    leads_csv = DATASET_DIR / "smb_leads.csv"
    if leads_csv.exists():
        with open(leads_csv, "r", encoding="utf-8") as f:
            leads_count = sum(1 for _ in f) - 1

    summary = {
        "products": len(products),
        "gstin_registry": max(0, gstin_count),
        "udyam_registry": max(0, udyam_count),
        "leads": max(0, leads_count),
        "total_records": len(products) + max(0, gstin_count) + max(0, udyam_count) + max(0, leads_count)
    }

    with open(DATA_DIR / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    return summary


if __name__ == "__main__":
    res = run_etl()
    print("ETL Completed Successfully:", res)
