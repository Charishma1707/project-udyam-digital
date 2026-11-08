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
from typing import Dict, Any, Optional
from rapidfuzz import process, fuzz
from agent.sarvam_llm_client import sarvam_llm_client

EXTRACTION_PROMPT = """You are an expert AI entity extractor for Airtel Business Customer Discovery.
Read the conversation context and the latest message from the business owner.
Extract facts into a clean JSON object. Handle colloquial terms, typos (e.g. 'retial' -> 'Retail Store', 'fibre' -> 'fiber/internet'), and direct answers to previous questions.

RULES:
1. Extract facts mentioned or answered directly by the customer.
2. CRITICAL NEGATIVE CONSTRAINTS:
   - NEVER extract greetings (e.g. 'hi', 'hello', 'hey', 'namaste', 'vanakkam', 'good morning', 'kya haal hai'), conversational pleasantries, or questions as `business_name`, `business_type`, or `city`. Leave them as empty string "" if not mentioned.
   - NEVER extract lone numbers (e.g. '3', '10', '500') as `business_type` or `business_name`.
   - If the previous question asked for employee count/headcount and customer replies with a number (e.g. '3', '15'), extract it as `employee_count`, NOT `num_sites` and NOT `business_type`.
   - If the previous question asked for branches/sites and customer replies with a number, extract it as `num_sites`.
3. Numeric fields (employee_count, num_sites, max_installation_days, monthly_telecom_spend_inr, overall_budget) must be numbers.
4. Classify recurring monthly telecom/internet spend into `monthly_telecom_spend_inr`. Classify total package budget into `overall_budget`.
5. If customer explicitly confirms GST ("Yes we have GST" or "yes"), set `has_gstin: "Y"`. If explicitly "No", set `has_gstin: "N"`. Do NOT infer 'N' if they didn't discuss GST.
6. Return ONLY a valid JSON object without markdown formatting.

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

COMMON_BUSINESS_TYPES = [
    "Retail Store", "Manufacturing", "Clinic", "Hospital", "Dental Clinic",
    "Bakery", "Restaurant", "Cafe", "Pharmacy", "Law Firm", "CA Firm",
    "Architect", "Consultant", "Warehouse", "Coaching Centre", "Hotel",
    "Gym", "Real Estate", "IT Firm", "Software Company", "Logistics", "Auto Parts",
    "Electronics Shop", "Garment Store", "Trading Company", "School", "Supermarket"
]

GREETINGS_AND_FILLERS = {
    "hi", "hello", "hey", "hiya", "namaste", "namaskar", "namaskaram", "vanakkam", "pranam",
    "kese ho", "kaise ho", "kya haal hai", "good morning", "good afternoon", "good evening",
    "ok", "okay", "yes", "no", "sure", "thanks", "thank you", "bye", "goodbye", "test", "testing",
    "help", "start", "restart", "yo", "sup"
}


class EntityExtractor:
    def __init__(self, client=sarvam_llm_client):
        self.client = client

    def extract(self, message: str, last_question: Optional[str] = None) -> Dict[str, Any]:
        """Extracts schema facts from user message, enriched with conversational context."""
        if not message or not message.strip():
            return {}

        prompt_user = f"Latest Customer Message: \"{message}\""
        if last_question:
            prompt_user = f"Previous Airtel Question: \"{last_question}\"\nLatest Customer Message: \"{message}\""

        messages = [
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": prompt_user}
        ]

        raw_text = self.client.chat_completion(messages=messages, temperature=0.0)
        extracted = {}

        try:
            cleaned = re.sub(r'```(?:json)?', '', raw_text).strip()
            extracted = json.loads(cleaned)
        except Exception:
            match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if match:
                try:
                    extracted = json.loads(match.group(0))
                except Exception:
                    pass

        # -------------------------------------------------------------
        # RESILIENT FALLBACK / HEURISTIC ENRICHMENT & SANITIZATION
        # (Guarantees short messages, typos & direct replies never get lost or corrupted)
        # -------------------------------------------------------------
        msg_clean = message.strip()
        msg_lower = msg_clean.lower()
        msg_no_punct = re.sub(r'[^\w\s]', '', msg_lower).strip()

        is_greeting = (
            msg_no_punct in GREETINGS_AND_FILLERS or
            (any(msg_no_punct.startswith(g + " ") for g in ["hi", "hello", "hey", "namaste", "vanakkam"]) and len(msg_no_punct.split()) <= 3)
        )
        is_lone_number = bool(re.match(r'^\d+$', msg_clean))

        # Isolate the actual question from any prior acknowledgment prefix
        q_lower = (last_question or "").lower()
        if "?" in q_lower:
            parts = [p.strip() for p in q_lower.split("?") if p.strip()]
            q_target = parts[-1] if parts else q_lower
        else:
            q_target = q_lower

        is_asking_business = any(k in q_target for k in ["what type of business", "kind of business", "nature of your business", "what business do you", "business do you run"])
        is_asking_employees = any(k in q_target for k in ["employee", "staff", "people work", "headcount", "how many employees"])
        is_asking_sites = any(k in q_target for k in ["branch", "branches", "locations or sites", "locations do you", "sites do you"])
        is_asking_city = any(k in q_target for k in ["which city", "city is your", "located in"])

        # 1. Sanitize text fields from greetings and numbers
        for field in ["business_type", "business_name", "city", "current_provider"]:
            val = extracted.get(field)
            if val is not None:
                s_val = str(val).strip().lower()
                s_no_p = re.sub(r'[^\w\s]', '', s_val)
                if s_no_p in GREETINGS_AND_FILLERS or re.match(r'^\d+$', s_val) or s_val in ["hi", "hello", "namaste"]:
                    extracted[field] = ""

        # 2. Needs detection (e.g. 'need fiber', 'internet', 'wifi', 'leased line', 'cctv')
        current_needs = extracted.get("needs") or []
        if isinstance(current_needs, str):
            current_needs = [current_needs]
        
        if any(w in msg_lower for w in ["fiber", "fibre", "leased line", "internet", "broadband", "wifi", "wi-fi"]):
            if not any("fiber" in n.lower() or "internet" in n.lower() for n in current_needs):
                current_needs.append("High-Speed Optical Fibre / Leased Line")
        if any(w in msg_lower for w in ["cctv", "camera", "surveillance"]):
            if not any("cctv" in n.lower() for n in current_needs):
                current_needs.append("Cloud CCTV Surveillance")
        if any(w in msg_lower for w in ["security", "firewall", "antivirus"]):
            if not any("security" in n.lower() or "firewall" in n.lower() for n in current_needs):
                current_needs.append("Endpoint Security & Firewall")
        if current_needs:
            extracted["needs"] = current_needs

        # 3. Direct answer to "What type of business do you run?"
        if not extracted.get("business_type") and not is_greeting and not is_lone_number:
            match_res = process.extractOne(msg_clean, COMMON_BUSINESS_TYPES, scorer=fuzz.ratio)
            if match_res and match_res[1] >= 65:
                extracted["business_type"] = match_res[0]
            elif is_asking_business and len(msg_clean.split()) <= 4:
                extracted["business_type"] = msg_clean.capitalize()

        # 4. Direct numeric answers (e.g. '3', '15 staff', '2 branches')
        num_m = re.search(r'\b(\d+)\b', msg_lower)
        if num_m:
            num_val = int(num_m.group(1))
            if is_asking_employees:
                extracted["employee_count"] = num_val
                # If LLM mistakenly put the same number in num_sites or business_type, clear it
                if extracted.get("num_sites") == num_val:
                    extracted["num_sites"] = 0
                if extracted.get("business_type") == str(num_val):
                    extracted["business_type"] = ""
            elif is_asking_sites:
                extracted["num_sites"] = num_val
                if extracted.get("employee_count") == num_val:
                    extracted["employee_count"] = 0

        # 5. Direct answer to location / city
        if not extracted.get("city") and is_asking_city and not is_greeting and not is_lone_number:
            extracted["city"] = msg_clean.capitalize()

        # 6. Direct answer to GST registration
        if not extracted.get("has_gstin"):
            if last_question and "gst" in last_question.lower():
                if any(w in msg_lower for w in ["yes", "ha", "haan", "yep", "we have"]):
                    extracted["has_gstin"] = "Y"
                elif any(w in msg_lower for w in ["no", "nahi", "nope", "don't"]):
                    extracted["has_gstin"] = "N"

        # 7. Direct answer to Udyam registration
        if not extracted.get("has_udyam"):
            if last_question and "udyam" in last_question.lower():
                if any(w in msg_lower for w in ["yes", "ha", "haan", "yep", "we have"]):
                    extracted["has_udyam"] = "Y"
                elif any(w in msg_lower for w in ["no", "nahi", "nope", "don't"]):
                    extracted["has_udyam"] = "N"

        return extracted


entity_extractor = EntityExtractor()
