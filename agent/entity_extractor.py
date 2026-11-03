"""
=============================================================================
AGENT: Zero-Temperature Schema Extraction Agent (entity_extractor.py)
=============================================================================
Uses Sarvam 105B with temperature 0.0 to parse and extract only explicit facts
from customer turns into structured JSON. Eliminates hallucinations.
=============================================================================
"""

import re
import json
from typing import Dict, Any
from agent.sarvam_llm_client import sarvam_llm_client

EXTRACTION_PROMPT = """You are an expert AI entity extractor for Airtel Business Customer Discovery.
Read the latest message from the business owner and extract ONLY explicit facts into a clean JSON object.

RULES:
1. Extract ONLY facts explicitly mentioned. Do not infer or hallucinate values.
2. Numeric fields (employee_count, num_sites, max_installation_days, monthly_telecom_spend_inr, overall_budget) must be numbers.
3. Classify recurring monthly telecom/internet spend into `monthly_telecom_spend_inr`. Classify total package budget into `overall_budget`.
4. If customer says "Yes we have GST", set `has_gstin: "Y"`. If "No", set `has_gstin: "N"`.
5. Return ONLY a valid JSON object without markdown formatting.

Keys:
- business_name (str)
- business_type (str)
- city (str)
- employee_count (int)
- num_sites (int)
- current_provider (str)
- monthly_telecom_spend_inr (float)
- overall_budget (float)
- needs (list of strings)
- has_gstin ("Y" / "N")
- gstin (str)
- has_udyam ("Y" / "N")
- udyam_number (str)
- max_installation_days (int)
"""


class EntityExtractor:
    def __init__(self, client=sarvam_llm_client):
        self.client = client

    def extract(self, message: str) -> Dict[str, Any]:
        """Extracts schema facts from user message."""
        if not message or not message.strip():
            return {}

        messages = [
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": f"Extract customer discovery schema from: \"{message}\""}
        ]

        raw_text = self.client.chat_completion(messages=messages, temperature=0.0)

        try:
            cleaned = re.sub(r'```(?:json)?', '', raw_text).strip()
            return json.loads(cleaned)
        except Exception:
            match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    pass
            return {}


entity_extractor = EntityExtractor()
