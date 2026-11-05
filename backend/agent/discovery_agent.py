"""
=============================================================================
AGENT: Customer Discovery Agent & 11-Stage Pipeline Orchestrator (discovery_agent.py)
=============================================================================
Powers the live split-screen experience:
- Ingests text or microphone speech
- Cleans and protects registration IDs (GSTIN & Udyam)
- Performs Indic language detection (Hindi, Telugu, Tamil, English)
- Extracts zero-temperature schema facts via Sarvam 105B
- Automatically enriches City Tier mappings
- Computes visual schema diffs
- Evaluates missing fields and percentage meter
- Plans the next single question with business justification
- Generates the 11-stage pipeline trace returned to the frontend visualizer
=============================================================================
"""

import time
from typing import Dict, Any, Optional

from agent.session_memory import session_memory
from agent.speech_cleaner import SpeechCleaner
from agent.sarvam_llm_client import sarvam_llm_client
from agent.entity_extractor import entity_extractor
from agent.question_planner import QuestionPlanner
from data_preprocessing.city_tier_mapping import city_tier_service


class CustomerDiscoveryAgent:
    def process_turn(
        self,
        message: str = "",
        session_id: Optional[str] = None,
        audio_bytes: Optional[bytes] = None,
        filename: str = "recording.wav",
        mime_type: str = "audio/wav"
    ) -> Dict[str, Any]:
        """
        Executes the full 11-stage AI customer discovery pipeline.
        """
        start_time = time.time()
        session = session_memory.get_or_create(session_id)
        pipeline_trace = []

        # ---------------------------------------------------------------------
        # STAGE 1: Customer Speech Input
        # ---------------------------------------------------------------------
        if audio_bytes:
            pipeline_trace.append({
                "stage": 1,
                "name": "Customer Speech",
                "status": "SUCCESS",
                "data": {
                    "audio_size_bytes": len(audio_bytes),
                    "filename": filename,
                    "mime_type": mime_type
                }
            })
            # STAGE 2: Speech-to-Text
            stt_result = sarvam_llm_client.speech_to_text(audio_bytes, filename, mime_type)
            raw_text = stt_result.get("transcript", "")
            cleaned_text = SpeechCleaner.clean(raw_text)
            message = cleaned_text or raw_text
            pipeline_trace.append({
                "stage": 2,
                "name": "Speech-to-Text (Sarvam Saaras:v3)",
                "status": "SUCCESS",
                "data": {
                    "raw_transcript": raw_text,
                    "cleaned_transcript": cleaned_text
                }
            })
        else:
            cleaned_text = SpeechCleaner.clean(message)
            pipeline_trace.append({
                "stage": 1,
                "name": "Customer Speech",
                "status": "SKIPPED",
                "data": {"mode": "text_input"}
            })
            pipeline_trace.append({
                "stage": 2,
                "name": "Speech-to-Text",
                "status": "SKIPPED",
                "data": {"input": message, "cleaned": cleaned_text}
            })
            message = cleaned_text

        # ---------------------------------------------------------------------
        # STAGE 3: Indic Language Detection
        # ---------------------------------------------------------------------
        detected_language = "English"
        msg_lower = message.lower()
        if any(w in msg_lower for w in ["namaste", "aap", "kaise", "hoga", "chahiye", "hai", "bataiye"]):
            detected_language = "Hindi / Hinglish"
        elif any(w in msg_lower for w in ["namaskaram", "kavali", "undi", "meeru", "cheppandi"]):
            detected_language = "Telugu"
        elif any(w in msg_lower for w in ["vanakkam", "vendum", "enga"]):
            detected_language = "Tamil"

        pipeline_trace.append({
            "stage": 3,
            "name": "Language Detection",
            "status": "SUCCESS",
            "data": {"detected_language": detected_language}
        })

        # ---------------------------------------------------------------------
        # STAGE 4: Schema Extraction (Zero-Temp Sarvam 105B + Conversational Context)
        # ---------------------------------------------------------------------
        last_question = None
        for m in reversed(session.history):
            if m.get("role") in ("assistant", "bot"):
                last_question = m.get("content")
                break

        extracted_facts = entity_extractor.extract(message, last_question=last_question)

        # Automatic City Tier tool lookup if city mentioned
        if "city" in extracted_facts and extracted_facts["city"]:
            tier_info = city_tier_service.lookup(extracted_facts["city"])
            if tier_info.get("matched"):
                extracted_facts["city_tier"] = tier_info.get("city_tier")
                extracted_facts["state"] = tier_info.get("state")

        pipeline_trace.append({
            "stage": 4,
            "name": "Schema Extraction (Sarvam 105B)",
            "status": "SUCCESS",
            "data": {"extracted_entities": extracted_facts}
        })

        # ---------------------------------------------------------------------
        # STAGE 5: Schema Comparison (Diff)
        # ---------------------------------------------------------------------
        old_profile = session.schema.to_dict()
        session.schema = session.schema.merge_updates(extracted_facts)
        new_profile = session.schema.to_dict()

        diff_cards = {}
        for key, val in new_profile.items():
            if old_profile.get(key) != val:
                diff_cards[key] = {
                    "previous": old_profile.get(key),
                    "current": val
                }

        pipeline_trace.append({
            "stage": 5,
            "name": "Schema Comparison (Diff)",
            "status": "SUCCESS",
            "data": {"diff": diff_cards}
        })

        # ---------------------------------------------------------------------
        # STAGE 6: Missing Information Detection
        # ---------------------------------------------------------------------
        detection = QuestionPlanner.detect_missing_fields(session.schema)
        pipeline_trace.append({
            "stage": 6,
            "name": "Missing Information Detection",
            "status": "SUCCESS",
            "data": {
                "missing_fields": detection["missing_fields"],
                "schema_complete": detection["schema_complete"]
            }
        })

        # ---------------------------------------------------------------------
        # STAGE 7: Schema Completion Meter
        # ---------------------------------------------------------------------
        completion_percent = QuestionPlanner.calculate_completion_percentage(session.schema)
        pipeline_trace.append({
            "stage": 7,
            "name": "Schema Completion Meter",
            "status": "SUCCESS",
            "data": {"completion_percentage": completion_percent}
        })

        # ---------------------------------------------------------------------
        # STAGE 8: Deterministic Question Planner
        # ---------------------------------------------------------------------
        plan = QuestionPlanner.plan_next_question(detection["missing_fields"])
        pipeline_trace.append({
            "stage": 8,
            "name": "Question Planner",
            "status": "SUCCESS",
            "data": plan or {"status": "Customer Discovery 100% Completed"}
        })

        # ---------------------------------------------------------------------
        # STAGE 9: Conversation Memory
        # ---------------------------------------------------------------------
        session.add_message("user", message)
        pipeline_trace.append({
            "stage": 9,
            "name": "Conversation Memory",
            "status": "SUCCESS",
            "data": {"turn_count": len(session.history)}
        })

        # ---------------------------------------------------------------------
        # STAGE 10: Current Customer Schema
        # ---------------------------------------------------------------------
        pipeline_trace.append({
            "stage": 10,
            "name": "Current Customer Schema",
            "status": "SUCCESS",
            "data": {"schema": session.schema.to_dict()}
        })

        # ---------------------------------------------------------------------
        # STAGE 11: Ready for Recommendation Status
        # ---------------------------------------------------------------------
        pipeline_trace.append({
            "stage": 11,
            "name": "Ready for Recommendation",
            "status": "SUCCESS",
            "data": {"ready": detection["schema_complete"]}
        })

        # Formulate assistant reply with explicit acknowledgement of captured facts
        captured_summaries = []
        if extracted_facts.get("business_type"):
            captured_summaries.append(f"business as {extracted_facts['business_type']}")
        elif session.schema.business_type and "business_type" in diff_cards:
            captured_summaries.append(f"business as {session.schema.business_type}")

        if extracted_facts.get("city"):
            captured_summaries.append(f"location in {extracted_facts['city']}")
        if extracted_facts.get("employee_count"):
            captured_summaries.append(f"{extracted_facts['employee_count']} employees")
        if extracted_facts.get("num_sites"):
            captured_summaries.append(f"{extracted_facts['num_sites']} site(s)")
        if extracted_facts.get("needs") and len(extracted_facts["needs"]) > 0:
            captured_summaries.append(f"requirements for {', '.join(extracted_facts['needs'])}")
        if extracted_facts.get("monthly_telecom_spend_inr"):
            captured_summaries.append(f"budget around ₹{int(extracted_facts['monthly_telecom_spend_inr'])}/mo")

        ack_prefix = ""
        if captured_summaries:
            ack_prefix = f"Understood, we have noted your {', '.join(captured_summaries)}. "
        elif len(session.history) > 1 and session.schema.business_type:
            ack_prefix = f"Got it, noting this for your {session.schema.business_type} operations. "

        if detection["schema_complete"]:
            b_name = session.schema.business_name or session.schema.business_type or "your business"
            reply = f"{ack_prefix}Thank you! We have verified all requirements for {b_name}. We have customized your enterprise recommendations on the right."
        elif plan:
            reply = f"{ack_prefix}{plan['canonical_question']}"
        else:
            reply = f"{ack_prefix}How can Airtel Business further assist your enterprise today?"

        session.add_message("assistant", reply)

        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "reply": reply,
            "session_id": session.session_id,
            "customer_schema": session.schema.to_dict(),
            "missing_fields": detection["missing_fields"],
            "completion_percentage": completion_percent,
            "ready_for_recommendation": detection["schema_complete"],
            "pipeline_trace": pipeline_trace,
            "schema_diff": diff_cards,
            "debug_telemetry": {
                "latency_ms": latency_ms,
                "stt_model": "saaras:v3",
                "llm_model": "sarvam-105b-conversations",
                "temperature": 0.0
            }
        }


discovery_agent = CustomerDiscoveryAgent()
