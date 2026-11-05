from schema.customer_profile import CustomerSchema
from recommendation.bundle_engine import bundle_engine
from data_preprocessing.business_segment_mapper import business_segment_mapper

def test_business_segment_mapping():
    assert business_segment_mapper.resolve("Supermarket")["segment"] == "Micro Retail & Services"
    assert business_segment_mapper.resolve("Legal Consultancy")["segment"] == "Professional Offices"
    assert business_segment_mapper.resolve("Plastic Factory")["segment"] == "Small Manufacturing"
    assert business_segment_mapper.resolve("Courier Chain Outlets")["segment"] == "Multi-site Businesses"

def test_bundle_engine_generation():
    schema = CustomerSchema(
        business_type="Bakery",
        employee_count=10,
        num_sites=1,
        city="Bengaluru",
        city_tier=1,
        needs=["WiFi", "CCTV"],
        monthly_telecom_spend_inr=3500,
        has_gstin="Y",
        max_installation_days=7
    )
    recs = bundle_engine.generate_recommendations(schema)
    assert recs["customer_segment"] == "Micro Retail & Services"
    assert len(recs["bundles"]) >= 2
    assert recs["bundles"][0]["monthly_total_inr"] > 0
    assert recs["bundles"][0]["score"] >= 50
