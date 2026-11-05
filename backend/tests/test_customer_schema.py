from schema.customer_profile import CustomerSchema

def test_customer_schema_defaults():
    schema = CustomerSchema()
    assert schema.employee_count is None
    assert schema.num_sites is None
    assert schema.needs == []
    assert schema.has_gstin is None

def test_numeric_coercion():
    schema = CustomerSchema(
        employee_count="50",
        num_sites="3",
        monthly_telecom_spend_inr="12,500.50",
        overall_budget="25,000",
        needs="High-Speed Internet; Cloud CCTV"
    )
    assert schema.employee_count == 50
    assert schema.num_sites == 3
    assert schema.monthly_telecom_spend_inr == 12500.5
    assert schema.overall_budget == 25000.0
    assert "High-Speed Internet" in schema.needs
    assert "Cloud CCTV" in schema.needs

def test_safe_merge():
    initial = CustomerSchema(business_name="Apex Logistics", employee_count=20, city="Mumbai")
    updated = initial.merge_updates({"employee_count": None, "city": "", "num_sites": 2})
    assert updated.business_name == "Apex Logistics"
    assert updated.employee_count == 20  # Preserved!
    assert updated.city == "Mumbai"      # Preserved!
    assert updated.num_sites == 2
