from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_database_status():
    res = client.get("/api/database/status")
    assert res.status_code == 200
    data = res.json()
    assert "primary_database" in data
    assert data["registries"]["products"] > 0

def test_chat_api():
    payload = {"message": "Hello, we run an engineering consultancy in Delhi with 8 employees."}
    res = client.post("/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert "pipeline_trace" in data
    assert len(data["pipeline_trace"]) == 11
