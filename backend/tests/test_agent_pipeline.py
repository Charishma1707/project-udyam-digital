from agent.speech_cleaner import SpeechCleaner
from agent.question_planner import QuestionPlanner
from agent.discovery_agent import discovery_agent
from schema.customer_profile import CustomerSchema

def test_speech_cleaner_protection():
    raw = "We operate 2 sites with GSTIN 27XAAAC1234A1Z5 and UDYAM-00-1234567 needing WiFi/CCTV"
    cleaned = SpeechCleaner.clean(raw)
    assert "27XAAAC1234A1Z5" in cleaned
    assert "UDYAM-00-1234567" in cleaned
    assert " and " in cleaned

def test_deterministic_planner():
    empty_schema = CustomerSchema()
    detection = QuestionPlanner.detect_missing_fields(empty_schema)
    assert not detection["schema_complete"]
    assert "business_type" in detection["missing_fields"]

    next_q = QuestionPlanner.plan_next_question(detection["missing_fields"])
    assert next_q["field"] == "business_type"

def test_discovery_agent_11_stages():
    result = discovery_agent.process_turn(
        message="We run a CA firm in Bengaluru with 15 staff members and need fibre internet.",
        session_id="test-agent-session"
    )
    assert "reply" in result
    assert "pipeline_trace" in result
    assert len(result["pipeline_trace"]) == 11
    assert result["completion_percentage"] > 0
    assert result["customer_schema"]["city"] == "Bengaluru"
