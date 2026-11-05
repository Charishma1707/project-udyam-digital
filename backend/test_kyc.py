import requests

url = "http://localhost:8000/api/kyc/upload"
files = {"file": ("test.txt", b"Sample GSTIN: 27AAACB2894G1Z8", "text/plain")}
data = {"doc_type": "gstin", "session_id": "test_session"}

try:
    resp = requests.post(url, files=files, data=data)
    print("Status:", resp.status_code)
    print("Body:", resp.text)
except Exception as e:
    print("Error:", e)

