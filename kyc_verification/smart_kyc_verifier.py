"""
=============================================================================
KYC VERIFICATION: Smart KYC Verification Engine (smart_kyc_verifier.py)
=============================================================================
Precision Vision OCR and Rule-Based Verification Pipeline for Enterprise KYC:
1. Document Pre-processing:
   - Suppresses pink watermark via Red channel isolation
   - Measures Laplacian variance for blur/degradation detection
   - Detects skew angle via HoughLinesP and auto-deskews using affine warp
2. Gemini 2.5 Flash Vision OCR:
   - Extracts structured Pydantic schemas (GST, Udyam, Electricity Bill, Signatory ID)
   - Joins split address tokens and line-wrapped PIN codes
3. Multi-Tier Verification Checks:
   - Step 1: Document presence & OCR image quality
   - Step 2: Intra-document mandatory fields & format regex (GSTIN, Udyam)
   - Step 3: Temporal checks (Utility bill age <= 90 days, Signatory ID expiry)
   - Step 4: Cross-document consistency (Business name, Address/PIN, State codes)
   - Step 5: Customer form input vs extracted document comparison
   - Step 6: Official mock registry validation (3,534 GSTIN & 2,723 Udyam records)
=============================================================================
"""

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from rapidfuzz import fuzz

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


# =====================================================================
# 1. PYDANTIC SCHEMAS FOR GEMINI VISION OCR
# =====================================================================

class GSTCertificateOCR(BaseModel):
    detected_doc_type: str = Field(description="Must be 'GST_CERTIFICATE', 'UDYAM_CERTIFICATE', 'ELECTRICITY_BILL', 'SIGNATORY_ID', or 'UNKNOWN'")
    gstin: Optional[str] = Field(default=None, description="15-character GSTIN, or null if blank/missing")
    legal_name: Optional[str] = Field(default=None, description="Exact Legal name field")
    trade_name: Optional[str] = Field(default=None, description="Exact Trade name field")
    constitution: Optional[str] = Field(default=None, description="e.g. Proprietorship, Limited Liability Partnership, Private Limited Company")
    address: Optional[str] = Field(default=None, description="Full address of principal place of business, joining wrapped lines cleanly")
    pin_code: Optional[str] = Field(default=None, description="6-digit PIN code from address, joining split digits if wrapped across lines")
    state: Optional[str] = Field(default=None, description="State name extracted from address")
    date_of_liability: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    registration_type: Optional[str] = Field(default=None)
    is_readable: bool = Field(default=True, description="False if text is too blurry or degraded to read")


class UdyamCertificateOCR(BaseModel):
    detected_doc_type: str = Field(description="Must be 'UDYAM_CERTIFICATE', 'GST_CERTIFICATE', 'ELECTRICITY_BILL', 'SIGNATORY_ID', or 'UNKNOWN'")
    udyam_number: Optional[str] = Field(default=None, description="UDYAM-XX-00-XXXXXXX, or null if blank/empty on document")
    enterprise_name: Optional[str] = Field(default=None)
    major_activity: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    state: Optional[str] = Field(default=None)
    date_of_registration: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    is_readable: bool = Field(default=True)


class AddressProofOCR(BaseModel):
    detected_doc_type: str = Field(description="Must be 'ELECTRICITY_BILL', 'GST_CERTIFICATE', 'UDYAM_CERTIFICATE', 'SIGNATORY_ID', or 'UNKNOWN'")
    consumer_no: Optional[str] = Field(default=None)
    billed_to: Optional[str] = Field(default=None)
    supply_address: Optional[str] = Field(default=None, description="Full supply address, joining wrapped lines cleanly")
    pin_code: Optional[str] = Field(default=None, description="6-digit PIN code from address")
    state: Optional[str] = Field(default=None)
    bill_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    units_consumed: Optional[str] = Field(default=None)
    amount_due: Optional[str] = Field(default=None)
    is_readable: bool = Field(default=True)


class SignatoryIDOCR(BaseModel):
    detected_doc_type: str = Field(description="Must be 'SIGNATORY_ID', 'GST_CERTIFICATE', 'UDYAM_CERTIFICATE', 'ELECTRICITY_BILL', or 'UNKNOWN'")
    name: Optional[str] = Field(default=None)
    designation: Optional[str] = Field(default=None)
    business_name: Optional[str] = Field(default=None, description="'For business' field")
    id_no: Optional[str] = Field(default=None)
    valid_till: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    is_readable: bool = Field(default=True)


# =====================================================================
# 2. INDIAN STATE CODES & REGEX RULES
# =====================================================================

STATE_CODE_MAP = {
    "jammu and kashmir": ("01", "JK"), "himachal pradesh": ("02", "HP"),
    "punjab": ("03", "PB"), "chandigarh": ("04", "CH"),
    "uttarakhand": ("05", "UK"), "haryana": ("06", "HR"),
    "delhi": ("07", "DL"), "rajasthan": ("08", "RJ"),
    "uttar pradesh": ("09", "UP"), "bihar": ("10", "BR"),
    "sikkim": ("11", "SK"), "arunachal pradesh": ("12", "AR"),
    "nagaland": ("13", "NL"), "manipur": ("14", "MN"),
    "mizoram": ("15", "MZ"), "tripura": ("16", "TR"),
    "meghalaya": ("17", "ML"), "assam": ("18", "AS"),
    "west bengal": ("19", "WB"), "jharkhand": ("20", "JH"),
    "odisha": ("21", "OD"), "chhattisgarh": ("22", "CG"),
    "madhya pradesh": ("23", "MP"), "gujarat": ("24", "GJ"),
    "maharashtra": ("27", "MH"), "karnataka": ("29", "KA"),
    "goa": ("30", "GA"), "kerala": ("32", "KL"),
    "tamil nadu": ("33", "TN"), "puducherry": ("34", "PY"),
    "telangana": ("36", "TS"), "andhra pradesh": ("37", "AP"),
}

# Standard GSTIN: 2 digits (state) + 5 letters (PAN) + 4 digits (PAN) + 1 letter (PAN) + 1 entity char + Z + 1 check char
STRICT_GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
# Lenient regex to detect OCR/synthetic '0' vs 'O' in PAN letters
LENIENT_GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z0-9]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
UDYAM_REGEX = re.compile(r"^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$")


# =====================================================================
# 3. IMAGE PRE-PROCESSING (BLUR, SKEW & WATERMARK REMOVAL)
# =====================================================================

def inspect_and_preprocess_image(
    image_path: str,
    blur_threshold: float = 85.0,
    skew_threshold_deg: float = 2.0,
) -> Tuple[Optional[bytes], List[Dict[str, Any]]]:
    """
    1. Checks if file exists and is decodable.
    2. Strips the pink 'SYNTHETIC SPECIMEN' watermark using the Red channel.
    3. Measures Laplacian sharpness (catches blurry documents).
    4. Measures rotation/skew angle and auto-deskews.
    """
    issues = []
    fname = Path(image_path).name
    bgr = cv2.imread(image_path)
    if bgr is None:
        issues.append({
            "code": "CORRUPT_OR_UNREADABLE_FILE",
            "severity": "ERROR",
            "document": fname,
            "message": f"Cannot decode image file '{fname}'."
        })
        return None, issues

    # Extract Red channel: pink watermark is high-R, so in the R channel it blends into the white background
    _, _, red_channel = cv2.split(bgr)

    # 1. Blur Detection (Laplacian variance on watermark-suppressed channel)
    sharpness = float(cv2.Laplacian(red_channel, cv2.CV_64F).var())
    if sharpness < blur_threshold:
        issues.append({
            "code": "BLURRY_DOCUMENT_SCAN",
            "severity": "ERROR",
            "document": fname,
            "message": f"Document '{fname}' is too blurry (sharpness={sharpness:.1f}, min={blur_threshold}). Please upload a clearer photo."
        })

    # 2. Skew / Rotation Detection & Auto-Deskew
    edges = cv2.Canny(red_channel, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=150, minLineLength=200, maxLineGap=20)
    skew_angle = 0.0
    if lines is not None:
        angles = []
        for line in lines:
            pts = line.ravel()
            if len(pts) >= 4:
                x1, y1, x2, y2 = pts[:4]
                angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                if -45.0 < angle < 45.0 and abs(angle) > 0.1:
                    angles.append(angle)
        if angles:
            skew_angle = float(np.median(angles))

    processed_img = bgr
    if abs(skew_angle) >= skew_threshold_deg:
        issues.append({
            "code": "SKEWED_DOCUMENT_SCAN",
            "severity": "WARNING",
            "document": fname,
            "message": f"Document '{fname}' was tilted by {skew_angle:.1f}° and has been auto-deskewed."
        })
        h, w = bgr.shape[:2]
        center = (w // 2, h // 2)
        rot_mat = cv2.getRotationMatrix2D(center, skew_angle, 1.0)
        processed_img = cv2.warpAffine(bgr, rot_mat, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    success, encoded = cv2.imencode(".png", processed_img)
    return (encoded.tobytes() if success else None), issues


# =====================================================================
# 4. TEXT NORMALIZATION & LINE-WRAP REPAIR HELPERS
# =====================================================================

def clean_address_for_comparison(addr: Optional[str]) -> str:
    """Repairs mid-word and mid-PIN line breaks by joining alphanumeric tokens."""
    if not addr:
        return ""
    return re.sub(r"[^a-z0-9]", "", addr.lower())


def normalize_name(name: Optional[str]) -> str:
    if not name:
        return ""
    return re.sub(r"\s+", " ", name).strip().lower()


def extract_prop_business_name(legal_name: Optional[str]) -> Tuple[str, Optional[str]]:
    """Splits 'Person (Prop. Business Name)' into (person_name, prop_business)."""
    if not legal_name:
        return "", None
    match = re.match(r"^(.*?)\s*\(\s*Prop\.?\s+(.*?)\s*\)\s*$", legal_name.strip(), re.IGNORECASE)
    if match:
        return normalize_name(match.group(1)), normalize_name(match.group(2))
    return normalize_name(legal_name), None


# =====================================================================
# 5. SMART KYC VERIFICATION ENGINE
# =====================================================================

class SmartKYCVerifier:
    def __init__(
        self,
        gst_registry_csv: Optional[str] = None,
        udyam_registry_csv: Optional[str] = None,
        api_key: Optional[str] = None,
        reference_date: datetime = datetime(2026, 7, 15),
        max_bill_age_days: int = 90,
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.client = None
        if GENAI_AVAILABLE and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception:
                self.client = None

        self.model = "gemini-2.5-flash"
        self.reference_date = reference_date
        self.max_bill_age_days = max_bill_age_days

        # Locate default registries in dataset if not provided
        default_dataset = BASE_DIR / "YTL_TrackA_Udyam_Digital_Data"
        gst_path = gst_registry_csv or str(default_dataset / "mock_gstin_registry.csv")
        udyam_path = udyam_registry_csv or str(default_dataset / "mock_udyam_registry.csv")

        self.gst_df = pd.read_csv(gst_path) if os.path.exists(gst_path) else None
        self.udyam_df = pd.read_csv(udyam_path) if os.path.exists(udyam_path) else None

    def _extract_with_gemini(self, img_bytes: bytes, schema_cls):
        """Extracts structured schema using Gemini Vision API with fallback."""
        if not self.client:
            # Fallback when Gemini API key is not present (mock extraction based on schema)
            return schema_cls(
                detected_doc_type=getattr(schema_cls, "__name__", "UNKNOWN").replace("OCR", ""),
                is_readable=True
            )

        prompt = (
            "You are a precision KYC OCR engine. Extract all fields from this document image into the JSON schema. "
            "RULES:\n"
            "1. Ignore the diagonal 'SYNTHETIC SPECIMEN - NOT A VALID DOCUMENT' watermark.\n"
            "2. If a field is blank/empty on the document (such as a missing registration number), set it to null.\n"
            "3. Join multi-line addresses and split PIN codes cleanly (e.g., 'Ludhi\\nana' -> 'Ludhiana', '75\\n2083' -> '752083').\n"
            "4. Set is_readable=False if the image is heavily blurred and characters cannot be read with certainty."
        )
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema_cls,
                    temperature=0.0,
                ),
            )
            return schema_cls.model_validate_json(response.text)
        except Exception:
            return schema_cls(
                detected_doc_type="UNKNOWN",
                is_readable=False
            )

    def verify_customer(
        self,
        applicant_id: str,
        uploaded_files: Dict[str, Optional[str]],
        user_inputs: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Full end-to-end multi-tier verification for a customer's KYC submission.
        """
        issues: List[Dict[str, Any]] = []
        extracted: Dict[str, Any] = {}

        expected_doc_types = {
            "gst": ("GST_CERTIFICATE", GSTCertificateOCR),
            "udyam": ("UDYAM_CERTIFICATE", UdyamCertificateOCR),
            "address": ("ELECTRICITY_BILL", AddressProofOCR),
            "signatory": ("SIGNATORY_ID", SignatoryIDOCR),
        }

        # -----------------------------------------------------------------
        # STEP 1: DOCUMENT PRESENCE, IMAGE QUALITY & OCR EXTRACTION
        # -----------------------------------------------------------------
        for slot, (expected_type, schema_cls) in expected_doc_types.items():
            fpath = uploaded_files.get(slot)
            if not fpath or not os.path.exists(fpath):
                issues.append({
                    "code": f"MISSING_DOCUMENT_{slot.upper()}",
                    "severity": "ERROR",
                    "document": slot,
                    "message": f"Required document '{slot}' was not uploaded."
                })
                continue

            img_bytes, img_issues = inspect_and_preprocess_image(fpath)
            issues.extend(img_issues)

            if img_bytes:
                ocr_obj = self._extract_with_gemini(img_bytes, schema_cls)
                extracted[slot] = ocr_obj

                if not ocr_obj.is_readable and not any(i["code"] == "BLURRY_DOCUMENT_SCAN" and i["document"] == Path(fpath).name for i in issues):
                    issues.append({
                        "code": "BLURRY_DOCUMENT_SCAN",
                        "severity": "ERROR",
                        "document": Path(fpath).name,
                        "message": f"Document '{Path(fpath).name}' is illegible/blurry."
                    })

                if ocr_obj.detected_doc_type != expected_type:
                    issues.append({
                        "code": "WRONG_DOCUMENT_TYPE_UPLOADED",
                        "severity": "ERROR",
                        "document": Path(fpath).name,
                        "message": f"Expected '{expected_type}' in slot '{slot}', but user uploaded '{ocr_obj.detected_doc_type}'."
                    })

        gst: Optional[GSTCertificateOCR] = extracted.get("gst")
        udyam: Optional[UdyamCertificateOCR] = extracted.get("udyam")
        addr: Optional[AddressProofOCR] = extracted.get("address")
        sig: Optional[SignatoryIDOCR] = extracted.get("signatory")

        # -----------------------------------------------------------------
        # STEP 2: INTRA-DOCUMENT MANDATORY FIELDS & FORMAT VALIDATION
        # -----------------------------------------------------------------
        if gst:
            if not gst.gstin or not gst.gstin.strip():
                issues.append({
                    "code": "BLANK_GSTIN_FIELD",
                    "severity": "ERROR",
                    "document": "gst",
                    "message": "GSTIN field is blank on the GST Certificate."
                })
            else:
                g_val = gst.gstin.strip().upper()
                if not LENIENT_GSTIN_REGEX.match(g_val):
                    issues.append({
                        "code": "INVALID_GSTIN_FORMAT",
                        "severity": "ERROR",
                        "document": "gst",
                        "message": f"GSTIN '{g_val}' does not match the 15-character GSTIN structure."
                    })
                elif not STRICT_GSTIN_REGEX.match(g_val):
                    issues.append({
                        "code": "GSTIN_PAN_DIGIT_ANOMALY",
                        "severity": "WARNING",
                        "document": "gst",
                        "message": f"GSTIN '{g_val}' contains a digit ('0') in the 5-letter PAN prefix (positions 3-7)."
                    })

        if udyam:
            if not udyam.udyam_number or not udyam.udyam_number.strip():
                issues.append({
                    "code": "BLANK_UDYAM_NUMBER",
                    "severity": "ERROR",
                    "document": "udyam",
                    "message": "Udyam registration number is missing/blank on the Udyam Certificate."
                })
            else:
                u_val = udyam.udyam_number.strip().upper()
                if not UDYAM_REGEX.match(u_val):
                    issues.append({
                        "code": "INVALID_UDYAM_FORMAT",
                        "severity": "ERROR",
                        "document": "udyam",
                        "message": f"Udyam number '{u_val}' does not match format UDYAM-XX-00-XXXXXXX."
                    })

        # -----------------------------------------------------------------
        # STEP 3: TEMPORAL / DATE & EXPIRY CHECKS
        # -----------------------------------------------------------------
        if addr and addr.bill_date:
            try:
                bill_dt = datetime.strptime(addr.bill_date.strip(), "%Y-%m-%d")
                age_days = (self.reference_date - bill_dt).days
                if age_days > self.max_bill_age_days:
                    issues.append({
                        "code": "STALE_UTILITY_BILL",
                        "severity": "ERROR",
                        "document": "address",
                        "message": f"Electricity bill dated {addr.bill_date} is {age_days} days old (limit is {self.max_bill_age_days} days)."
                    })
                elif age_days < -30:
                    issues.append({
                        "code": "FUTURE_DATED_UTILITY_BILL",
                        "severity": "ERROR",
                        "document": "address",
                        "message": f"Electricity bill date {addr.bill_date} is in the future."
                    })
            except ValueError:
                issues.append({
                    "code": "INVALID_BILL_DATE",
                    "severity": "ERROR",
                    "document": "address",
                    "message": f"Unparseable bill date '{addr.bill_date}'."
                })

        if sig and sig.valid_till:
            try:
                exp_dt = datetime.strptime(sig.valid_till.strip(), "%Y-%m-%d")
                if exp_dt < self.reference_date:
                    issues.append({
                        "code": "EXPIRED_SIGNATORY_ID",
                        "severity": "ERROR",
                        "document": "signatory",
                        "message": f"Signatory ID expired on {sig.valid_till}."
                    })
            except ValueError:
                issues.append({
                    "code": "INVALID_ID_EXPIRY_DATE",
                    "severity": "ERROR",
                    "document": "signatory",
                    "message": f"Unparseable Signatory ID expiry date '{sig.valid_till}'."
                })

        # -----------------------------------------------------------------
        # STEP 4: CROSS-DOCUMENT CONSISTENCY CHECKS
        # -----------------------------------------------------------------
        biz_names = {}
        if gst and gst.trade_name:
            biz_names["gst_trade_name"] = normalize_name(gst.trade_name)
        if gst and gst.legal_name:
            _, prop_biz = extract_prop_business_name(gst.legal_name)
            if prop_biz:
                biz_names["gst_legal_prop_name"] = prop_biz
            elif gst.constitution and "proprietorship" not in gst.constitution.lower():
                biz_names["gst_legal_name"] = normalize_name(gst.legal_name)
        if udyam and udyam.enterprise_name:
            biz_names["udyam_enterprise_name"] = normalize_name(udyam.enterprise_name)
        if addr and addr.billed_to:
            biz_names["utility_billed_to"] = normalize_name(addr.billed_to)
        if sig and sig.business_name:
            biz_names["signatory_for_business"] = normalize_name(sig.business_name)

        unique_biz_names = set(biz_names.values())
        if len(unique_biz_names) > 1:
            issues.append({
                "code": "BUSINESS_NAME_MISMATCH",
                "severity": "ERROR",
                "document": "cross_doc",
                "message": f"Business name mismatch across KYC documents: {biz_names}"
            })

        # Address & PIN Consistency
        if gst and addr and gst.address and addr.supply_address:
            if clean_address_for_comparison(gst.address) != clean_address_for_comparison(addr.supply_address):
                issues.append({
                    "code": "ADDRESS_MISMATCH",
                    "severity": "ERROR",
                    "document": "cross_doc",
                    "message": f"GST address ('{gst.address}') does not match Utility Bill supply address ('{addr.supply_address}')."
                })

        # State & State-Code Consistency
        state_str = (udyam.state if udyam and udyam.state else (gst.state if gst else None))
        if state_str:
            norm_state = normalize_name(state_str)
            if norm_state in STATE_CODE_MAP:
                exp_gst_prefix, exp_udyam_prefix = STATE_CODE_MAP[norm_state]
                if gst and gst.gstin and not gst.gstin.strip().startswith(exp_gst_prefix):
                    issues.append({
                        "code": "GST_STATE_CODE_MISMATCH",
                        "severity": "ERROR",
                        "document": "gst",
                        "message": f"GSTIN prefix '{gst.gstin[:2]}' does not match state '{state_str}' (expected '{exp_gst_prefix}')."
                    })
                if udyam and udyam.udyam_number and not udyam.udyam_number.strip().startswith(f"UDYAM-{exp_udyam_prefix}-"):
                    issues.append({
                        "code": "UDYAM_STATE_CODE_MISMATCH",
                        "severity": "ERROR",
                        "document": "udyam",
                        "message": f"Udyam state prefix in '{udyam.udyam_number}' does not match state '{state_str}' (expected 'UDYAM-{exp_udyam_prefix}-')."
                    })

        # Signatory Name & Designation vs GST Constitution
        if gst and sig:
            person_in_gst, _ = extract_prop_business_name(gst.legal_name)
            if gst.constitution and "proprietorship" in gst.constitution.lower():
                if person_in_gst and sig.name and normalize_name(sig.name) != person_in_gst:
                    issues.append({
                        "code": "PROPRIETOR_SIGNATORY_NAME_MISMATCH",
                        "severity": "ERROR",
                        "document": "cross_doc",
                        "message": f"Signatory ID name ('{sig.name}') does not match GST Proprietor ('{person_in_gst}')."
                    })
                if sig.designation and normalize_name(sig.designation) not in ("owner", "proprietor"):
                    issues.append({
                        "code": "SIGNATORY_ROLE_WARNING",
                        "severity": "WARNING",
                        "document": "signatory",
                        "message": f"Business is a Proprietorship, but Signatory ID lists designation as '{sig.designation}'."
                    })
            elif gst.constitution and ("partnership" in gst.constitution.lower() or "private limited" in gst.constitution.lower()):
                if sig.designation and normalize_name(sig.designation) == "owner":
                    issues.append({
                        "code": "SIGNATORY_ROLE_WARNING",
                        "severity": "WARNING",
                        "document": "signatory",
                        "message": f"Constitution is '{gst.constitution}', but Signatory ID lists designation as 'Owner' instead of Partner/Director."
                    })

        # -----------------------------------------------------------------
        # STEP 5: USER FORM INPUT VS EXTRACTED DOCUMENT DATA
        # -----------------------------------------------------------------
        if user_inputs:
            if "gstin" in user_inputs and gst and gst.gstin:
                if user_inputs["gstin"].strip().upper() != gst.gstin.strip().upper():
                    issues.append({
                        "code": "USER_INPUT_GSTIN_MISMATCH",
                        "severity": "ERROR",
                        "document": "user_input",
                        "message": f"User entered GSTIN '{user_inputs['gstin']}', but certificate shows '{gst.gstin}'."
                    })
            if "udyam_number" in user_inputs and udyam and udyam.udyam_number:
                if user_inputs["udyam_number"].strip().upper() != udyam.udyam_number.strip().upper():
                    issues.append({
                        "code": "USER_INPUT_UDYAM_MISMATCH",
                        "severity": "ERROR",
                        "document": "user_input",
                        "message": f"User entered Udyam '{user_inputs['udyam_number']}', but certificate shows '{udyam.udyam_number}'."
                    })
            if "business_name" in user_inputs and gst and gst.trade_name:
                similarity = fuzz.ratio(normalize_name(user_inputs["business_name"]), normalize_name(gst.trade_name))
                if similarity < 85:
                    issues.append({
                        "code": "USER_INPUT_BUSINESS_NAME_MISMATCH",
                        "severity": "ERROR",
                        "document": "user_input",
                        "message": f"User entered business name '{user_inputs['business_name']}', which does not match '{gst.trade_name}'."
                    })

        # -----------------------------------------------------------------
        # STEP 6: MOCK REGISTRY LOOKUP
        # -----------------------------------------------------------------
        if gst and gst.gstin and self.gst_df is not None:
            g_col = next((c for c in self.gst_df.columns if "gstin" in c.lower()), None)
            if g_col:
                row = self.gst_df[self.gst_df[g_col].astype(str).str.strip().str.upper() == gst.gstin.strip().upper()]
                if row.empty:
                    issues.append({
                        "code": "GSTIN_NOT_FOUND_IN_REGISTRY",
                        "severity": "ERROR",
                        "document": "gst_registry",
                        "message": f"GSTIN '{gst.gstin}' was not found in mock_gstin_registry.csv."
                    })
                else:
                    rec = row.iloc[0]
                    status_col = next((c for c in self.gst_df.columns if "status" in c.lower()), None)
                    if status_col:
                        reg_status = str(rec[status_col]).strip().lower()
                        if reg_status != "active":
                            issues.append({
                                "code": "GSTIN_REGISTRY_STATUS_INACTIVE",
                                "severity": "ERROR",
                                "document": "gst_registry",
                                "message": f"GSTIN '{gst.gstin}' has status '{rec[status_col]}' in the official GST registry."
                            })
                    for col_name, doc_val, err_code in [
                        ("legal_name", gst.legal_name, "GST_REGISTRY_LEGAL_NAME_MISMATCH"),
                        ("trade_name", gst.trade_name, "GST_REGISTRY_TRADE_NAME_MISMATCH"),
                    ]:
                        matched_col = next((c for c in self.gst_df.columns if col_name in c.lower()), None)
                        if matched_col and doc_val and pd.notna(rec[matched_col]):
                            if normalize_name(str(rec[matched_col])) != normalize_name(doc_val):
                                issues.append({
                                    "code": err_code,
                                    "severity": "ERROR",
                                    "document": "gst_registry",
                                    "message": f"Document {col_name} ('{doc_val}') does not match GST registry ('{rec[matched_col]}')."
                                })
                    addr_col = next((c for c in self.gst_df.columns if "address" in c.lower()), None)
                    if addr_col and gst.address and pd.notna(rec[addr_col]):
                        if clean_address_for_comparison(str(rec[addr_col])) != clean_address_for_comparison(gst.address):
                            issues.append({
                                "code": "GST_REGISTRY_ADDRESS_MISMATCH",
                                "severity": "ERROR",
                                "document": "gst_registry",
                                "message": f"Document address ('{gst.address}') does not match GST registry address ('{rec[addr_col]}')."
                            })

        if udyam and udyam.udyam_number and self.udyam_df is not None:
            u_col = next((c for c in self.udyam_df.columns if "udyam" in c.lower()), None)
            if u_col:
                row = self.udyam_df[self.udyam_df[u_col].astype(str).str.strip().str.upper() == udyam.udyam_number.strip().upper()]
                if row.empty:
                    issues.append({
                        "code": "UDYAM_NOT_FOUND_IN_REGISTRY",
                        "severity": "ERROR",
                        "document": "udyam_registry",
                        "message": f"Udyam number '{udyam.udyam_number}' was not found in mock_udyam_registry.csv."
                    })
                else:
                    rec = row.iloc[0]
                    status_col = next((c for c in self.udyam_df.columns if "status" in c.lower()), None)
                    if status_col and pd.notna(rec[status_col]):
                        if str(rec[status_col]).strip().lower() not in ("active", "registered", "valid"):
                            issues.append({
                                "code": "UDYAM_REGISTRY_STATUS_INACTIVE",
                                "severity": "ERROR",
                                "document": "udyam_registry",
                                "message": f"Udyam '{udyam.udyam_number}' has status '{rec[status_col]}' in the official Udyam registry."
                            })
                    ent_col = next((c for c in self.udyam_df.columns if "enterprise" in c.lower() or "name" in c.lower()), None)
                    if ent_col and udyam.enterprise_name and pd.notna(rec[ent_col]):
                        if normalize_name(str(rec[ent_col])) != normalize_name(udyam.enterprise_name):
                            issues.append({
                                "code": "UDYAM_REGISTRY_NAME_MISMATCH",
                                "severity": "ERROR",
                                "document": "udyam_registry",
                                "message": f"Udyam enterprise name ('{udyam.enterprise_name}') does not match registry ('{rec[ent_col]}')."
                            })

        hard_errors = [i for i in issues if i["severity"] == "ERROR"]
        warnings = [i for i in issues if i["severity"] == "WARNING"]

        return {
            "applicant_id": applicant_id,
            "kyc_approved": len(hard_errors) == 0,
            "status": "APPROVED" if len(hard_errors) == 0 else "REJECTED",
            "error_count": len(hard_errors),
            "warning_count": len(warnings),
            "issues": issues,
            "extracted_data": {k: v.model_dump() for k, v in extracted.items()},
        }


# =====================================================================
# 6. HELPER TO AUTO-DISCOVER FILES FOR ANY APPLICANT (K01 TO K12)
# =====================================================================

def find_applicant_files(kyc_dir: str, applicant_id: str) -> Dict[str, Optional[str]]:
    slot_patterns = {
        "address": "address_proof",
        "gst": "gst_certificate",
        "signatory": "signatory_id",
        "udyam": "udyam_certificate",
    }
    found: Dict[str, Optional[str]] = {k: None for k in slot_patterns}
    if not os.path.exists(kyc_dir):
        return found
    for fname in os.listdir(kyc_dir):
        if fname.upper().startswith(applicant_id.upper() + "_"):
            for slot, pattern in slot_patterns.items():
                if pattern in fname.lower():
                    found[slot] = os.path.join(kyc_dir, fname)
    return found


smart_kyc_verifier = SmartKYCVerifier()
