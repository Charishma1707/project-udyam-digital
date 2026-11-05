"""
=============================================================================
RECOMMENDATION: Solution Bundle Engine & What-If Simulator (bundle_engine.py)
=============================================================================
Phase 2 Recommendation & Scoring Engine (14-Stage Compliant):
- Connects directly to the recommendation_pipeline (knowledge-based + need-based + lookalike)
- Generates 2 transparent bundles: Primary Best Match & Value Saver
- Implements MMR diversity, dependency closure, and learned quantities
- Generates What-If unlock insights for GSTIN additions and timeline flexibility
- Fully compliant with reccomendation.md specification and backwards-compatible
=============================================================================
"""

from typing import Dict, Any, List
from schema.customer_profile import CustomerSchema
from recommendation.pipeline import recommendation_pipeline
from database.db_client import db_client


class BundleRecommendationEngine:
    def generate_recommendations(self, schema: CustomerSchema) -> Dict[str, Any]:
        """
        Executes the 14-stage recommendation pipeline and formats response
        conforming to both reccomendation.md and legacy UI contracts.
        """
        data = schema.to_dict() if hasattr(schema, "to_dict") else dict(schema)

        # Execute full 14-stage recommendation pipeline
        pipeline_res = recommendation_pipeline.recommend(data)

        target_segment = pipeline_res["profile_used"].get("segment", "Micro Retail & Services")
        city_tier = pipeline_res["profile_used"].get("city_tier", 1)

        # Format legacy bundles list for UI compatibility
        bundles = []
        for opt in pipeline_res.get("options", []):
            label = opt.get("label", "Recommended")
            is_primary = label == "Recommended"
            b_code = "BUNDLE-PRIMARY" if is_primary else "BUNDLE-SAVER"
            b_type = "PRIMARY_BEST_MATCH" if is_primary else "VALUE_SAVER"

            # Score as percentage [0, 100] for UI meters
            score_pct = int(opt.get("score", 0.8) * 100)

            fit_reasons = [r.get("summary", "") for r in opt.get("reasons", []) if r.get("summary")]
            if not fit_reasons:
                fit_reasons = [f"Tailored for {target_segment} requirements"]

            bundles.append({
                "bundle_code": b_code,
                "bundle_name": f"{target_segment} {label}",
                "tagline": opt.get("purpose", "Tailored enterprise solutions suite"),
                "type": b_type,
                "score": score_pct,
                "monthly_total_inr": opt["quote"]["monthly_total"],
                "setup_total_inr": opt["quote"]["setup_total"],
                "contract_months": opt["quote"]["contract_months"],
                "estimated_install_days": opt["quote"]["eta_days"],
                "products": opt["products"],
                "fit_reasons": fit_reasons[:3],
                "explanation": opt.get("explanation", {}),
                "addons": opt.get("addons", {}),
                "nps_boost_applied": is_primary,
                "savings_vs_individual_inr": 450 if is_primary else 200
            })

        # What-if unlock insights
        what_if_insights = []
        unlockable_gstin = pipeline_res.get("unlockable", {}).get("with_gstin", [])
        catalogue_map = {p["product_id"]: p for p in db_client.get_products()}

        if unlockable_gstin:
            prod_names = [catalogue_map[pid]["product_name"] for pid in unlockable_gstin if pid in catalogue_map]
            p_m = bundles[0]["monthly_total_inr"] if bundles else 2000.0
            what_if_insights.append({
                "type": "GSTIN_UNLOCK",
                "title": f"Unlock {len(unlockable_gstin)} Enterprise Product(s) with GSTIN",
                "description": "Providing a GSTIN unlocks dedicated internet leased lines, static IPs, and 18% Input Tax Credit.",
                "potential_unlocks": prod_names,
                "potential_tax_benefit_inr": int(p_m * 0.18)
            })

        max_install = data.get("max_installation_days")
        if max_install and max_install < 14:
            what_if_insights.append({
                "type": "TIMELINE_ADJUSTMENT",
                "title": "Timeline Flexibility Benefit",
                "description": f"Extending your deployment timeline beyond {max_install} days unlocks high-capacity optical fibre lines.",
                "potential_unlocks": ["Internet Leased Line 20", "Internet Leased Line 100"]
            })

        # Merge new spec fields with backwards-compatible fields
        response = dict(pipeline_res)
        response.update({
            "customer_segment": target_segment,
            "city_tier": city_tier,
            "eligible_products_count": len(db_client.get_products()) - len(pipeline_res["options"][0].get("excluded", [])) if pipeline_res.get("options") else 15,
            "total_products_count": len(db_client.get_products()),
            "bundles": bundles,
            "what_if_insights": what_if_insights
        })

        return response


bundle_engine = BundleRecommendationEngine()
