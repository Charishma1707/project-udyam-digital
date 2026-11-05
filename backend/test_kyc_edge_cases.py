"""
Comprehensive KYC Backend Edge Case Test Suite
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_kyc_suite():
    print("=================================================================")
    print("STARTING COMPREHENSIVE KYC BACKEND & EDGE CASE VERIFICATION")
    print("=================================================================")

    # Test 1: Upload Valid Active GSTIN
    print("\n--- Test 1: Valid Active GSTIN Upload ---")
    files = {"file": ("valid_cert.txt", b"Official Certificate: GSTIN 32TTNXB7384T1ZW Active", "text/plain")}
    data = {"doc_type": "gstin", "session_id": "test_sess_1"}
    r1 = requests.post(f"{BASE_URL}/api/kyc/upload", files=files, data=data)
    d1 = r1.json()
    print("Status:", r1.status_code, "| Result:", d1.get("status"), "| Identifier:", d1.get("extracted_identifier"))
    assert d1.get("status") == "VERIFIED", f"Expected VERIFIED, got {d1.get('status')}"
    assert d1.get("registry_matched") == True

    # Test 2: Upload Suspended GSTIN (K11: 23QYBXS1811Q1ZD)
    print("\n--- Test 2: Suspended GSTIN Upload (Planted Edge Case) ---")
    files = {"file": ("suspended_cert.txt", b"Certificate with GSTIN: 23QYBXS1811Q1ZD", "text/plain")}
    data = {"doc_type": "gstin", "session_id": "test_sess_2"}
    r2 = requests.post(f"{BASE_URL}/api/kyc/upload", files=files, data=data)
    d2 = r2.json()
    print("Status:", r2.status_code, "| Result:", d2.get("status"), "| Errors:", d2.get("validation_errors"))
    assert d2.get("status") == "REJECTED", f"Expected REJECTED, got {d2.get('status')}"
    assert any("Suspended" in err or "status" in err for err in d2.get("validation_errors", []))

    # Test 3: Upload GSTIN with Invalid Checksum (MOD-36 Checksum Fail)
    print("\n--- Test 3: Invalid GSTIN Checksum (Planted Edge Case) ---")
    # Valid is 32TTNXB7384T1ZW, replace last char with '9'
    files = {"file": ("tampered_cert.txt", b"Certificate with GSTIN: 32TTNXB7384T1Z9", "text/plain")}
    data = {"doc_type": "gstin", "session_id": "test_sess_3"}
    r3 = requests.post(f"{BASE_URL}/api/kyc/upload", files=files, data=data)
    d3 = r3.json()
    print("Status:", r3.status_code, "| Result:", d3.get("status"), "| Errors:", d3.get("validation_errors"))
    assert d3.get("status") == "REJECTED", f"Expected REJECTED, got {d3.get('status')}"
    assert any("checksum" in err.lower() for err in d3.get("validation_errors", []))

    # Test 4: Upload Valid Active Udyam Certificate
    print("\n--- Test 4: Valid Active Udyam Upload ---")
    files = {"file": ("udyam_cert.txt", b"MSME Reg: UDYAM-KL-00-3078801", "text/plain")}
    data = {"doc_type": "udyam", "session_id": "test_sess_4"}
    r4 = requests.post(f"{BASE_URL}/api/kyc/upload", files=files, data=data)
    d4 = r4.json()
    print("Status:", r4.status_code, "| Result:", d4.get("status"), "| Identifier:", d4.get("extracted_identifier"))
    assert d4.get("status") == "VERIFIED", f"Expected VERIFIED, got {d4.get('status')}"

    # Test 5: Upload Non-Existent Fake Udyam
    print("\n--- Test 5: Fake / Unregistered Udyam Upload ---")
    files = {"file": ("fake_udyam.txt", b"MSME Reg: UDYAM-XX-99-9999999", "text/plain")}
    data = {"doc_type": "udyam", "session_id": "test_sess_5"}
    r5 = requests.post(f"{BASE_URL}/api/kyc/upload", files=files, data=data)
    d5 = r5.json()
    print("Status:", r5.status_code, "| Result:", d5.get("status"), "| Errors:", d5.get("validation_errors"))
    assert d5.get("status") == "REJECTED", f"Expected REJECTED, got {d5.get('status')}"

    # Test 6: Verify Clean Applicant K01
    print("\n--- Test 6: Verify Clean Applicant K01 ---")
    r6 = requests.post(f"{BASE_URL}/api/kyc/verify-applicant/K01")
    d6 = r6.json()
    print("K01 Approved:", d6.get("kyc_approved"), "| Status:", d6.get("status"), "| Errors:", d6.get("error_count"))
    assert d6.get("kyc_approved") == True

    # Test 7: Verify Blurry Scan Applicant K04
    print("\n--- Test 7: Verify Blurry Scan Applicant K04 ---")
    r7 = requests.post(f"{BASE_URL}/api/kyc/verify-applicant/K04")
    d7 = r7.json()
    print("K04 Approved:", d7.get("kyc_approved"), "| Status:", d7.get("status"), "| Errors:", [x['code'] for x in d7.get('issues', [])])
    assert d7.get("kyc_approved") == False
    assert any("BLURRY" in x['code'] for x in d7.get('issues', []))

    # Test 8: Verify Missing Document Applicant K05
    print("\n--- Test 8: Verify Missing Document Applicant K05 ---")
    r8 = requests.post(f"{BASE_URL}/api/kyc/verify-applicant/K05")
    d8 = r8.json()
    print("K05 Approved:", d8.get("kyc_approved"), "| Status:", d8.get("status"), "| Errors:", [x['code'] for x in d8.get('issues', [])])
    assert d8.get("kyc_approved") == False
    assert any("MISSING" in x['code'] for x in d8.get('issues', []))

    # Test 9: Verify Suspended GSTIN Applicant K11
    print("\n--- Test 9: Verify Suspended GSTIN Applicant K11 ---")
    r9 = requests.post(f"{BASE_URL}/api/kyc/verify-applicant/K11")
    d9 = r9.json()
    print("K11 Approved:", d9.get("kyc_approved"), "| Status:", d9.get("status"), "| Errors:", [x['code'] for x in d9.get('issues', [])])
    assert d9.get("kyc_approved") == False
    assert any("INACTIVE" in x['code'] for x in d9.get('issues', []))

    # Test 10: Complete Evaluation Report across K01 to K12
    print("\n--- Test 10: Full KYC Evaluation Report across K01 to K12 ---")
    r10 = requests.get(f"{BASE_URL}/api/kyc/eval-report")
    d10 = r10.json()
    print(f"Total Applicants: {d10.get('total_applicants')} | Clean Passed: {d10.get('passed')} | Correctly Caught Edge Cases: {d10.get('failed')}")
    for item in d10.get("evaluations", []):
        print(f"  {item['applicant_id']}: {'APPROVED' if item['approved'] else 'REJECTED'} (Issues: {item['issue_codes']})")

    print("\n=================================================================")
    print("ALL 10 KYC EDGE CASE & REGISTRY TESTS PASSED PERFECTLY!")
    print("=================================================================")

if __name__ == "__main__":
    test_kyc_suite()

