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
        # STAGE 4: Schema Extraction (Zero-Temp Sarvam 105B)
        # ---------------------------------------------------------------------
        extracted_facts = entity_extractor.extract(message)

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

        # Formulate assistant reply
        if detection["schema_complete"]:
            b_name = session.schema.business_name or "your business"
            reply = f"Thank you! We have completed customer discovery for {b_name}. We are now ready to generate your tailored Airtel Business solution bundles."
        elif plan:
            reply = plan["canonical_question"]
        else:
            reply = "How can Airtel Business assist your enterprise today?"

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
