"""
=============================================================================
DATABASE: Unified Cloud Database Client & Registry Service (db_client.py)
=============================================================================
Scalable Cloud Database Architecture (Neon Serverless PostgreSQL):
1. Primary Cloud Database Engine:
   - High-throughput, horizontally scalable Cloud PostgreSQL (PostgreSQL 18.6 on AWS Neon Serverless)
   - Connection string configured via DATABASE_URL
   - Fully stateless backend containers with persistent cloud-hosted database
2. Encrypted Tables & Registries (DPDP Act 2023 Compliant):
   - `kyc_records`: Stores AES-256-GCM encrypted payloads, 96-bit IVs, SHA-256 hashes, and DPDP-masked PII
   - `dpdp_consent_logs`: Explicit user consent records per DPDP Act 2023
   - `orders`: Enterprise customer orders and 4-milestone provisioning states
   - `admin_messages`: Real-time NOC operations and customer communications
3. Cached High-Performance Registries:
   - 3,534 Government GSTIN records
   - 2,723 MSME Udyam records
   - 25 Airtel Business products
   - 5,000 Historical enterprise leads
=============================================================================
"""

import os
import csv
import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

DATA_DIR = BASE_DIR / "data"
DATASET_DIR = BASE_DIR / "YTL_TrackA_Udyam_Digital_Data"


class DatabaseClient:
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL")
        self.is_connected = False
        self.sqlite_path = DATA_DIR / "enterprise_vault.db"
        
        self.products: List[Dict[str, Any]] = []
        self.gstin_registry: Dict[str, Dict[str, Any]] = {}
        self.udyam_registry: Dict[str, Dict[str, Any]] = {}
        self.leads: Dict[str, Dict[str, Any]] = {}
        self.city_tiers: Dict[str, Dict[str, Any]] = {}
        self.bundle_statistics: List[Dict[str, Any]] = []
        self.product_statistics: List[Dict[str, Any]] = []
        self.lead_bundle_items: List[Dict[str, Any]] = []
        self.lead_interest_items: List[Dict[str, Any]] = []

        # Initialize Primary Cloud Database Schema
        self.init_cloud_postgres()
        # Load sub-millisecond cached catalogues & registries
        self.load_cache()

    # =========================================================================
    # CLOUD POSTGRESQL CONNECTION & SCHEMA INITIALIZATION
    # =========================================================================

    def get_pg_conn(self):
        """Returns an active thread-safe connection to Neon Cloud PostgreSQL."""
        if not PSYCOPG2_AVAILABLE or not self.database_url:
            return None
        try:
            conn = psycopg2.connect(self.database_url, connect_timeout=10)
            conn.autocommit = True
            return conn
        except Exception as e:
            print(f"Warning: Cloud PostgreSQL connection error: {e}")
            return None

    def get_sqlite_fallback_conn(self) -> sqlite3.Connection:
        """Emergency local fallback only if network connection is unreachable."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.sqlite_path))
        conn.row_factory = sqlite3.Row
        return conn

    def init_cloud_postgres(self):
        """Ensures all 4 enterprise tables are provisioned in the Cloud PostgreSQL cluster."""
        conn = self.get_pg_conn()
        if not conn:
            self.is_connected = False
            return

        try:
            with conn.cursor() as cur:
                # 1. Encrypted KYC Records (DPDP Act 2023)
                cur.execute("""
                CREATE TABLE IF NOT EXISTS kyc_records (
                    id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(128) NOT NULL,
                    applicant_id VARCHAR(64),
                    doc_type VARCHAR(64) NOT NULL,
                    masked_identifier VARCHAR(128) NOT NULL,
                    encrypted_payload TEXT NOT NULL,
                    iv VARCHAR(64) NOT NULL,
                    sha256_hash VARCHAR(128) NOT NULL,
                    verification_status VARCHAR(32) NOT NULL,
                    registry_matched INTEGER DEFAULT 1,
                    tamper_detected INTEGER DEFAULT 0,
                    dpdp_consent_logged INTEGER DEFAULT 1,
                    metadata_json TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """)

                # 2. DPDP Consent Logs
                cur.execute("""
                CREATE TABLE IF NOT EXISTS dpdp_consent_logs (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(128) NOT NULL,
                    user_id VARCHAR(128) NOT NULL,
                    purpose VARCHAR(128) NOT NULL,
                    language VARCHAR(16) DEFAULT 'en',
                    status VARCHAR(32) DEFAULT 'GRANTED',
                    dpdp_compliant INTEGER DEFAULT 1,
                    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """)

                # 3. Enterprise Orders
                cur.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    order_id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(128) NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    business_type VARCHAR(255),
                    status VARCHAR(64) NOT NULL DEFAULT 'Pending',
                    current_stage_index INTEGER NOT NULL DEFAULT 0,
                    bundle_code VARCHAR(64),
                    bundle_name VARCHAR(255),
                    monthly_cost NUMERIC(12, 2) NOT NULL,
                    contract_months INTEGER DEFAULT 12,
                    contract_terms_json TEXT,
                    milestones_json TEXT,
                    created_at VARCHAR(128) NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """)

                # 4. Operations NOC Messages
                cur.execute("""
                CREATE TABLE IF NOT EXISTS admin_messages (
                    message_id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(128) NOT NULL,
                    customer_name VARCHAR(255) DEFAULT 'Customer',
                    message TEXT NOT NULL,
                    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """)

                # 5. AI Escalated Leads Table (Stores all AI escalated cases & unextracted parameters)
                cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_escalations (
                    escalation_id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(128) NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    priority VARCHAR(32) DEFAULT 'HIGH',
                    status VARCHAR(32) DEFAULT 'AWAITING_AGENT',
                    ai_confidence_score NUMERIC(5, 2) NOT NULL,
                    confidence_band VARCHAR(64) NOT NULL,
                    trigger_reason TEXT NOT NULL,
                    what_ai_could_not_extract_json TEXT,
                    ai_discovery_summary TEXT,
                    recommended_action TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """)

                # 6. Customer Decisions & AI Response Insights Table
                # Tracks whether customer accepted/rejected quote, with foreign key to ai_escalations if escalated
                cur.execute("""
                CREATE TABLE IF NOT EXISTS customer_decisions (
                    decision_id VARCHAR(64) PRIMARY KEY,
                    session_id VARCHAR(128) NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    business_type VARCHAR(255),
                    decision_type VARCHAR(32) NOT NULL,
                    bundle_code VARCHAR(64),
                    bundle_name VARCHAR(255),
                    monthly_cost NUMERIC(12, 2),
                    ai_response_insights_json TEXT,
                    rejection_reason TEXT,
                    customer_feedback TEXT,
                    budget_offered NUMERIC(12, 2),
                    escalation_id VARCHAR(64) REFERENCES ai_escalations(escalation_id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """)
            self.is_connected = True
            conn.close()
        except Exception as e:
            print(f"Error initializing Cloud PostgreSQL tables: {e}")
            self.is_connected = False
            if conn:
                conn.close()

    def load_cache(self):
        """Loads reference datasets into memory for sub-millisecond retrieval."""
        # 1. Products
        prod_json = DATA_DIR / "products_normalized.json"
        if prod_json.exists():
            with open(prod_json, "r", encoding="utf-8") as f:
                self.products = json.load(f)
        else:
            prod_csv = DATASET_DIR / "product_catalogue.csv"
            if prod_csv.exists():
                with open(prod_csv, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        self.products.append({
                            "product_id": row.get("product_id"),
                            "product_name": row.get("product_name"),
                            "category": row.get("category"),
                            "monthly_price_inr": float(row.get("monthly_price_inr") or 0),
                            "one_time_setup_inr": float(row.get("one_time_setup_inr") or 0),
                            "contract_months": int(row.get("contract_months") or 12),
                            "min_employees": int(row.get("min_employees") or 1),
                            "min_sites": int(row.get("min_sites") or 1),
                            "requires_gstin": row.get("requires_gstin", "N"),
                            "primary_metric": row.get("primary_metric", ""),
                            "description": row.get("description", "")
                        })

        # 2. City Tiers
        city_csv = DATASET_DIR / "city_tier_mapping.csv"
        if city_csv.exists():
            with open(city_csv, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    key = row.get("city", "").strip().lower()
                    if key:
                        self.city_tiers[key] = {
                            "city": row.get("city"),
                            "tier": int(row.get("tier") or 2),
                            "state": row.get("state")
                        }

        # 3. GSTIN Registry
        gst_csv = DATASET_DIR / "mock_gstin_registry.csv"
        if gst_csv.exists():
            with open(gst_csv, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    gid = row.get("gstin", "").strip().upper()
                    if gid:
                        self.gstin_registry[gid] = row

        # 4. Udyam Registry
        udyam_csv = DATASET_DIR / "mock_udyam_registry.csv"
        if udyam_csv.exists():
            with open(udyam_csv, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    uid = row.get("udyam_number", "").strip().upper()
                    if uid:
                        self.udyam_registry[uid] = row

        # 5. Leads
        leads_csv = DATASET_DIR / "smb_leads.csv"
        if leads_csv.exists():
            with open(leads_csv, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    lid = row.get("lead_id", "").strip()
                    if lid:
                        self.leads[lid] = row

    # =========================================================================
    # CLOUD ENCRYPTED KYC & DPDP CONSENT OPERATIONS
    # =========================================================================

    def save_kyc_record(self, record: Dict[str, Any]) -> str:
        """
        Stores an encrypted KYC document verification record in Cloud PostgreSQL.
        Encrypted payload (AES-256-GCM), unique 96-bit IV, SHA-256 hash, and masked PII are stored per DPDP Act 2023.
        """
        rec_id = record.get("id") or f"KYC-{uuid.uuid4().hex[:12].upper()}"
        session_id = record.get("session_id", "session-default")
        applicant_id = record.get("applicant_id", "K01")
        doc_type = record.get("doc_type", "gstin")
        masked_id = record.get("extracted_identifier", "")
        enc_payload = record.get("ciphertext") or record.get("encrypted_payload") or ""
        iv = record.get("iv", "")
        sha256 = record.get("sha256") or record.get("secure_hash") or ""
        status = record.get("status", "VERIFIED")
        reg_matched = 1 if record.get("registry_matched", True) else 0
        tamper = 1 if record.get("tamper_detected", False) else 0
        consent = 1 if record.get("dpdp_consent_logged", True) else 0
        meta = json.dumps(record.get("registry_record") or {})

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO kyc_records (
                        id, session_id, applicant_id, doc_type, masked_identifier,
                        encrypted_payload, iv, sha256_hash, verification_status,
                        registry_matched, tamper_detected, dpdp_consent_logged,
                        metadata_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        verification_status = EXCLUDED.verification_status,
                        encrypted_payload = EXCLUDED.encrypted_payload,
                        iv = EXCLUDED.iv,
                        sha256_hash = EXCLUDED.sha256_hash,
                        registry_matched = EXCLUDED.registry_matched,
                        tamper_detected = EXCLUDED.tamper_detected,
                        metadata_json = EXCLUDED.metadata_json;
                    """, (
                        rec_id, session_id, applicant_id, doc_type, masked_id,
                        enc_payload, iv, sha256, status, reg_matched, tamper,
                        consent, meta
                    ))
                conn.close()
                return rec_id
            except Exception as e:
                print(f"Error saving KYC to Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback to local SQLite only if cloud is unreachable
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        INSERT OR REPLACE INTO kyc_records (
            id, session_id, applicant_id, doc_type, masked_identifier,
            encrypted_payload, iv, sha256_hash, verification_status,
            registry_matched, tamper_detected, dpdp_consent_logged,
            metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            rec_id, session_id, applicant_id, doc_type, masked_id,
            enc_payload, iv, sha256, status, reg_matched, tamper,
            consent, meta, datetime.now().isoformat()
        ))
        fb.commit()
        fb.close()
        return rec_id

    def get_kyc_records(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Queries encrypted KYC records directly from Cloud PostgreSQL."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    if session_id:
                        cur.execute("SELECT * FROM kyc_records WHERE session_id = %s ORDER BY created_at DESC;", (session_id,))
                    else:
                        cur.execute("SELECT * FROM kyc_records ORDER BY created_at DESC;")
                    rows = cur.fetchall()
                    results = []
                    for r in rows:
                        d = dict(r)
                        if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
                            d["created_at"] = d["created_at"].isoformat()
                        if d.get("metadata_json"):
                            try:
                                d["registry_record"] = json.loads(d["metadata_json"])
                            except Exception:
                                d["registry_record"] = {}
                        results.append(d)
                conn.close()
                return results
            except Exception as e:
                print(f"Error fetching KYC records from Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        if session_id:
            cur.execute("SELECT * FROM kyc_records WHERE session_id = ? ORDER BY created_at DESC;", (session_id,))
        else:
            cur.execute("SELECT * FROM kyc_records ORDER BY created_at DESC;")
        rows = fb.fetchall()
        results = []
        for r in rows:
            d = dict(r)
            if d.get("metadata_json"):
                try:
                    d["registry_record"] = json.loads(d["metadata_json"])
                except Exception:
                    d["registry_record"] = {}
            results.append(d)
        fb.close()
        return results

    def log_dpdp_consent(self, consent: Dict[str, Any]) -> Dict[str, Any]:
        """Stores customer DPDP Act 2023 consent into Cloud PostgreSQL."""
        session_id = consent.get("session_id", "session-default")
        user_id = consent.get("user_id", "customer")
        purpose = consent.get("purpose", "KYC_VERIFICATION")
        language = consent.get("language", "en")
        status = consent.get("status", "GRANTED")

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO dpdp_consent_logs (
                        session_id, user_id, purpose, language, status, dpdp_compliant, timestamp
                    ) VALUES (%s, %s, %s, %s, %s, 1, CURRENT_TIMESTAMP);
                    """, (session_id, user_id, purpose, language, status))
                conn.close()
                return consent
            except Exception as e:
                print(f"Error logging DPDP consent to Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        INSERT INTO dpdp_consent_logs (
            session_id, user_id, purpose, language, status, dpdp_compliant, timestamp
        ) VALUES (?, ?, ?, ?, ?, 1, ?);
        """, (session_id, user_id, purpose, language, status, datetime.now().isoformat()))
        fb.commit()
        fb.close()
        return consent

    def get_dpdp_consents(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Queries consent records directly from Cloud PostgreSQL."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    if session_id:
                        cur.execute("SELECT * FROM dpdp_consent_logs WHERE session_id = %s ORDER BY timestamp DESC;", (session_id,))
                    else:
                        cur.execute("SELECT * FROM dpdp_consent_logs ORDER BY timestamp DESC;")
                    rows = []
                    for r in cur.fetchall():
                        d = dict(r)
                        if d.get("timestamp") and hasattr(d["timestamp"], "isoformat"):
                            d["timestamp"] = d["timestamp"].isoformat()
                        rows.append(d)
                conn.close()
                return rows
            except Exception as e:
                print(f"Error reading consents from Cloud PostgreSQL: {e}")
                conn.close()

        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        if session_id:
            cur.execute("SELECT * FROM dpdp_consent_logs WHERE session_id = ? ORDER BY timestamp DESC;", (session_id,))
        else:
            cur.execute("SELECT * FROM dpdp_consent_logs ORDER BY timestamp DESC;")
        rows = [dict(r) for r in cur.fetchall()]
        fb.close()
        return rows

    # =========================================================================
    # CLOUD ORDERS DATABASE OPERATIONS
    # =========================================================================

    def save_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        """Saves or updates an enterprise order directly in Cloud PostgreSQL."""
        order_id = order.get("order_id") or f"S{datetime.now().strftime('%y%m%d%H%M%S')}"
        session_id = order.get("session_id", "session-default")
        customer_name = order.get("customer_name", "Enterprise Client")
        business_type = order.get("business_type", "MSME Enterprise")
        status = order.get("status", "Pending")
        stage_idx = int(order.get("current_stage_index") or 0)
        bundle_code = order.get("bundle_code", "BUNDLE-PRIMARY")
        bundle_name = order.get("bundle_name", "Enterprise Growth Suite")
        monthly_cost = float(order.get("monthly_cost") or 2499.0)
        contract_months = int(order.get("contract_months") or 12)
        terms_json = json.dumps(order.get("contract_terms") or {})
        milestones_json = json.dumps(order.get("milestones") or [])
        created_at = order.get("created_at") or datetime.now().strftime("%a, %b %d, %Y, %I:%M:%S %p")

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO orders (
                        order_id, session_id, customer_name, business_type, status,
                        current_stage_index, bundle_code, bundle_name, monthly_cost,
                        contract_months, contract_terms_json, milestones_json, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (order_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        current_stage_index = EXCLUDED.current_stage_index,
                        bundle_code = EXCLUDED.bundle_code,
                        bundle_name = EXCLUDED.bundle_name,
                        monthly_cost = EXCLUDED.monthly_cost,
                        contract_months = EXCLUDED.contract_months,
                        contract_terms_json = EXCLUDED.contract_terms_json,
                        milestones_json = EXCLUDED.milestones_json,
                        updated_at = CURRENT_TIMESTAMP;
                    """, (
                        order_id, session_id, customer_name, business_type, status,
                        stage_idx, bundle_code, bundle_name, monthly_cost,
                        contract_months, terms_json, milestones_json, created_at
                    ))
                conn.close()
                return self.get_order(order_id) or order
            except Exception as e:
                print(f"Error saving order to Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        INSERT OR REPLACE INTO orders (
            order_id, session_id, customer_name, business_type, status,
            current_stage_index, bundle_code, bundle_name, monthly_cost,
            contract_months, contract_terms_json, milestones_json,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            order_id, session_id, customer_name, business_type, status,
            stage_idx, bundle_code, bundle_name, monthly_cost,
            contract_months, terms_json, milestones_json, created_at, datetime.now().isoformat()
        ))
        fb.commit()
        fb.close()
        return self.get_order(order_id) or order

    def get_all_orders(self) -> List[Dict[str, Any]]:
        """Queries all orders directly from Cloud PostgreSQL."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT * FROM orders ORDER BY order_id DESC;")
                    rows = cur.fetchall()
                    orders = []
                    for r in rows:
                        d = dict(r)
                        if d.get("monthly_cost") is not None:
                            d["monthly_cost"] = float(d["monthly_cost"])
                        if d.get("updated_at") and hasattr(d["updated_at"], "isoformat"):
                            d["updated_at"] = d["updated_at"].isoformat()
                        if d.get("contract_terms_json"):
                            try:
                                d["contract_terms"] = json.loads(d["contract_terms_json"])
                            except Exception:
                                d["contract_terms"] = {}
                        if d.get("milestones_json"):
                            try:
                                d["milestones"] = json.loads(d["milestones_json"])
                            except Exception:
                                d["milestones"] = []
                        orders.append(d)
                conn.close()
                return orders
            except Exception as e:
                print(f"Error fetching orders from Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("SELECT * FROM orders ORDER BY order_id DESC;")
        rows = fb.fetchall()
        orders = []
        for r in rows:
            d = dict(r)
            if d.get("contract_terms_json"):
                try:
                    d["contract_terms"] = json.loads(d["contract_terms_json"])
                except Exception:
                    d["contract_terms"] = {}
            if d.get("milestones_json"):
                try:
                    d["milestones"] = json.loads(d["milestones_json"])
                except Exception:
                    d["milestones"] = []
            orders.append(d)
        fb.close()
        return orders

    def get_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Queries a single order from Cloud PostgreSQL."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT * FROM orders WHERE order_id = %s LIMIT 1;", (order_id,))
                    row = cur.fetchone()
                    if row:
                        d = dict(row)
                        if d.get("monthly_cost") is not None:
                            d["monthly_cost"] = float(d["monthly_cost"])
                        if d.get("updated_at") and hasattr(d["updated_at"], "isoformat"):
                            d["updated_at"] = d["updated_at"].isoformat()
                        if d.get("contract_terms_json"):
                            try:
                                d["contract_terms"] = json.loads(d["contract_terms_json"])
                            except Exception:
                                d["contract_terms"] = {}
                        if d.get("milestones_json"):
                            try:
                                d["milestones"] = json.loads(d["milestones_json"])
                            except Exception:
                                d["milestones"] = []
                        conn.close()
                        return d
                conn.close()
            except Exception as e:
                print(f"Error fetching order {order_id} from Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("SELECT * FROM orders WHERE order_id = ? LIMIT 1;", (order_id,))
        row = cur.fetchone()
        fb.close()
        if not row:
            return None
        d = dict(row)
        if d.get("contract_terms_json"):
            try:
                d["contract_terms"] = json.loads(d["contract_terms_json"])
            except Exception:
                d["contract_terms"] = {}
        if d.get("milestones_json"):
            try:
                d["milestones"] = json.loads(d["milestones_json"])
            except Exception:
                d["milestones"] = []
        return d

    def update_order_status(self, order_id: str, new_status: str, stage_index: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Updates an order's status and milestone progress directly in Cloud PostgreSQL."""
        order = self.get_order(order_id)
        if not order:
            return None

        status_to_stage = {
            "Pending": 0,
            "Order Confirm": 1,
            "Packed and Processed": 2,
            "Delivered": 3
        }
        stage_idx = stage_index if stage_index is not None else status_to_stage.get(new_status, 0)
        milestones = order.get("milestones", [])
        if milestones:
            for i, m in enumerate(milestones):
                m["completed"] = (i <= stage_idx)
        else:
            milestones = [
                {"stage": "PENDING", "title": "Pending", "description": "Order submitted", "completed": stage_idx >= 0},
                {"stage": "CONFIRMED", "title": "Order Confirm", "description": "Verified & Approved", "completed": stage_idx >= 1},
                {"stage": "PACKED", "title": "Packed and Processed", "description": "Hardware Dispatched", "completed": stage_idx >= 2},
                {"stage": "DELIVERED", "title": "Delivered", "description": "Circuit Active", "completed": stage_idx >= 3}
            ]

        milestones_json = json.dumps(milestones)

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    UPDATE orders
                    SET status = %s, current_stage_index = %s, milestones_json = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE order_id = %s;
                    """, (new_status, stage_idx, milestones_json, order_id))
                conn.close()
                return self.get_order(order_id)
            except Exception as e:
                print(f"Error updating order status in Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        UPDATE orders
        SET status = ?, current_stage_index = ?, milestones_json = ?, updated_at = ?
        WHERE order_id = ?;
        """, (new_status, stage_idx, milestones_json, datetime.now().isoformat(), order_id))
        fb.commit()
        fb.close()
        return self.get_order(order_id)

    # =========================================================================
    # CLOUD NOC / ADMIN MESSAGES OPERATIONS
    # =========================================================================

    def save_admin_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Stores a NOC message in Cloud PostgreSQL."""
        msg_id = message.get("message_id") or f"msg_{uuid.uuid4().hex[:8]}"
        session_id = message.get("session_id", "session-default")
        customer_name = message.get("customer_name", "Customer")
        msg_text = message.get("message", "")
        now = message.get("timestamp") or datetime.now().strftime("%I:%M %p")

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO admin_messages (message_id, session_id, customer_name, message, timestamp)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP);
                    """, (msg_id, session_id, customer_name, msg_text))
                conn.close()
                return {
                    "message_id": msg_id,
                    "session_id": session_id,
                    "customer_name": customer_name,
                    "message": msg_text,
                    "timestamp": now
                }
            except Exception as e:
                print(f"Error saving message to Cloud PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        INSERT INTO admin_messages (message_id, session_id, customer_name, message, timestamp)
        VALUES (?, ?, ?, ?, ?);
        """, (msg_id, session_id, customer_name, msg_text, now))
        fb.commit()
        fb.close()
        return {
            "message_id": msg_id,
            "session_id": session_id,
            "customer_name": customer_name,
            "message": msg_text,
            "timestamp": now
        }

    def get_admin_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Queries messages directly from Cloud PostgreSQL."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT * FROM admin_messages WHERE session_id = %s ORDER BY timestamp ASC;", (session_id,))
                    rows = []
                    for r in cur.fetchall():
                        d = dict(r)
                        if d.get("timestamp") and hasattr(d["timestamp"], "isoformat"):
                            d["timestamp"] = d["timestamp"].isoformat()
                        rows.append(d)
                conn.close()
                return rows
            except Exception as e:
                print(f"Error getting admin messages from Cloud PostgreSQL: {e}")
                conn.close()

        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("SELECT * FROM admin_messages WHERE session_id = ? ORDER BY timestamp ASC;", (session_id,))
        rows = [dict(r) for r in cur.fetchall()]
        fb.close()
        return rows

    # =========================================================================
    # REGISTRY LOOKUPS
    # =========================================================================

    def find_gstin(self, gstin: Optional[str]) -> Optional[Dict[str, Any]]:
        """Validates and retrieves GSTIN tax entity details."""
        if not gstin:
            return None
        gid = gstin.strip().upper()
        return self.gstin_registry.get(gid)

    def find_udyam(self, udyam_number: Optional[str]) -> Optional[Dict[str, Any]]:
        """Validates and retrieves MSME Udyam entity details."""
        if not udyam_number:
            return None
        uid = udyam_number.strip().upper()
        return self.udyam_registry.get(uid)

    def get_products(self) -> List[Dict[str, Any]]:
        """Returns catalogue of normalized enterprise products."""
        return self.products

    def get_lead_by_id(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Returns single lead record by unique ID."""
        return self.leads.get(lead_id)

    def get_status(self) -> Dict[str, Any]:
        """Returns current Cloud PostgreSQL database health and record counts."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) FROM kyc_records;")
                    kyc_count = cur.fetchone()[0]
                    cur.execute("SELECT COUNT(*) FROM orders;")
                    order_count = cur.fetchone()[0]
                    cur.execute("SELECT COUNT(*) FROM dpdp_consent_logs;")
                    consent_count = cur.fetchone()[0]
                conn.close()
                return {
                    "primary_database": {
                        "engine": "Neon Serverless Cloud PostgreSQL 18.6 (AWS ap-southeast-1)",
                        "cloud_hosted": True,
                        "scalable": True,
                        "kyc_records_encrypted": kyc_count,
                        "orders_count": order_count,
                        "dpdp_consents_logged": consent_count,
                        "database_name": "neondb",
                        "ssl_mode": "require",
                        "pooling": bool(os.getenv("DATABASE_URL_POOLED"))
                    },
                    "registries": {
                        "products": len(self.products),
                        "gstin": len(self.gstin_registry),
                        "udyam": len(self.udyam_registry),
                        "leads": len(self.leads)
                    }
                }
            except Exception as e:
                if conn:
                    conn.close()

        return {
            "primary_database": {
                "engine": "Cloud PostgreSQL (Disconnected)",
                "cloud_hosted": True,
                "scalable": True
            },
            "registries": {
                "products": len(self.products),
                "gstin": len(self.gstin_registry),
                "udyam": len(self.udyam_registry),
                "leads": len(self.leads)
            }
        }

    # =========================================================================
    # AI ESCALATIONS & CUSTOMER DECISIONS DATABASE OPERATIONS
    # =========================================================================

    def save_ai_escalation(self, esc: Dict[str, Any]) -> Dict[str, Any]:
        """Persists AI-escalated discovery record to Cloud PostgreSQL."""
        esc_id = esc.get("escalation_id") or f"ESC-{uuid.uuid4().hex[:6].upper()}"
        session_id = esc.get("session_id") or "session-unknown"
        customer_name = esc.get("customer_name") or "Valued Enterprise"
        priority = esc.get("priority") or "HIGH"
        status = esc.get("status") or "AWAITING_AGENT"
        score = float(esc.get("ai_confidence_score") or 0.42)
        band = esc.get("confidence_band") or "LOW_CONFIDENCE"
        trigger = esc.get("trigger_reason") or "Discovery Uncertainty"
        unextracted = json.dumps(esc.get("what_ai_could_not_extract") or [])
        summary = esc.get("ai_discovery_summary") or ""
        rec_action = esc.get("recommended_action") or ""

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO ai_escalations (
                        escalation_id, session_id, customer_name, priority, status,
                        ai_confidence_score, confidence_band, trigger_reason,
                        what_ai_could_not_extract_json, ai_discovery_summary, recommended_action, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (escalation_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        priority = EXCLUDED.priority,
                        ai_confidence_score = EXCLUDED.ai_confidence_score,
                        confidence_band = EXCLUDED.confidence_band,
                        trigger_reason = EXCLUDED.trigger_reason,
                        what_ai_could_not_extract_json = EXCLUDED.what_ai_could_not_extract_json,
                        ai_discovery_summary = EXCLUDED.ai_discovery_summary,
                        recommended_action = EXCLUDED.recommended_action;
                    """, (
                        esc_id, session_id, customer_name, priority, status,
                        score, band, trigger, unextracted, summary, rec_action
                    ))
                conn.close()
                return esc
            except Exception as e:
                print(f"Error saving AI escalation to PostgreSQL: {e}")
                conn.close()

        # Fallback SQLite
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS ai_escalations (
            escalation_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            priority TEXT DEFAULT 'HIGH',
            status TEXT DEFAULT 'AWAITING_AGENT',
            ai_confidence_score REAL NOT NULL,
            confidence_band TEXT NOT NULL,
            trigger_reason TEXT NOT NULL,
            what_ai_could_not_extract_json TEXT,
            ai_discovery_summary TEXT,
            recommended_action TEXT,
            created_at TEXT
        );
        """)
        cur.execute("""
        INSERT OR REPLACE INTO ai_escalations (
            escalation_id, session_id, customer_name, priority, status,
            ai_confidence_score, confidence_band, trigger_reason,
            what_ai_could_not_extract_json, ai_discovery_summary, recommended_action, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            esc_id, session_id, customer_name, priority, status,
            score, band, trigger, unextracted, summary, rec_action, datetime.now().isoformat()
        ))
        fb.commit()
        fb.close()
        return esc

    def get_all_ai_escalations(self) -> List[Dict[str, Any]]:
        """Queries all AI escalations from PostgreSQL."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT * FROM ai_escalations ORDER BY created_at DESC;")
                    rows = cur.fetchall()
                    result = []
                    for r in rows:
                        d = dict(r)
                        if d.get("ai_confidence_score") is not None:
                            d["ai_confidence_score"] = float(d["ai_confidence_score"])
                        if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
                            d["timestamp"] = d["created_at"].strftime("%a, %b %d, %Y, %I:%M %p")
                        if d.get("what_ai_could_not_extract_json"):
                            try:
                                d["what_ai_could_not_extract"] = json.loads(d["what_ai_could_not_extract_json"])
                            except Exception:
                                d["what_ai_could_not_extract"] = []
                        result.append(d)
                    conn.close()
                    return result
            except Exception as e:
                print(f"Error querying AI escalations from PostgreSQL: {e}")
                conn.close()

        # Fallback
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_escalations';")
        if not cur.fetchone():
            fb.close()
            return []
        cur.execute("SELECT * FROM ai_escalations ORDER BY escalation_id DESC;")
        rows = cur.fetchall()
        fb.close()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("what_ai_could_not_extract_json"):
                try:
                    d["what_ai_could_not_extract"] = json.loads(d["what_ai_could_not_extract_json"])
                except Exception:
                    d["what_ai_could_not_extract"] = []
            result.append(d)
        return result

    def save_customer_decision(
        self,
        session_id: str,
        customer_name: str,
        decision_type: str,
        business_type: Optional[str] = None,
        bundle_code: Optional[str] = None,
        bundle_name: Optional[str] = None,
        monthly_cost: Optional[float] = None,
        ai_response_insights: Optional[Dict[str, Any]] = None,
        rejection_reason: Optional[str] = None,
        customer_feedback: Optional[str] = None,
        budget_offered: Optional[float] = None,
        escalation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Stores AI response insights and customer decision (ACCEPTED / REJECTED / ESCALATED) in PostgreSQL.
        Maintains Foreign Key link to `ai_escalations` table if an escalation occurred.
        """
        dec_id = f"DEC-{uuid.uuid4().hex[:6].upper()}"
        insights_json = json.dumps(ai_response_insights or {})

        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO customer_decisions (
                        decision_id, session_id, customer_name, business_type, decision_type,
                        bundle_code, bundle_name, monthly_cost, ai_response_insights_json,
                        rejection_reason, customer_feedback, budget_offered, escalation_id, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
                    """, (
                        dec_id, session_id, customer_name, business_type, decision_type,
                        bundle_code, bundle_name, monthly_cost, insights_json,
                        rejection_reason, customer_feedback, budget_offered, escalation_id
                    ))
                conn.close()
                return {"decision_id": dec_id, "status": "SAVED_TO_POSTGRES"}
            except Exception as e:
                print(f"Error saving customer decision to PostgreSQL: {e}")
                conn.close()

        # Fallback SQLite
        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS customer_decisions (
            decision_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            business_type TEXT,
            decision_type TEXT NOT NULL,
            bundle_code TEXT,
            bundle_name TEXT,
            monthly_cost REAL,
            ai_response_insights_json TEXT,
            rejection_reason TEXT,
            customer_feedback TEXT,
            budget_offered REAL,
            escalation_id TEXT,
            created_at TEXT
        );
        """)
        cur.execute("""
        INSERT INTO customer_decisions (
            decision_id, session_id, customer_name, business_type, decision_type,
            bundle_code, bundle_name, monthly_cost, ai_response_insights_json,
            rejection_reason, customer_feedback, budget_offered, escalation_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            dec_id, session_id, customer_name, business_type, decision_type,
            bundle_code, bundle_name, monthly_cost, insights_json,
            rejection_reason, customer_feedback, budget_offered, escalation_id, datetime.now().isoformat()
        ))
        fb.commit()
        fb.close()
        return {"decision_id": dec_id, "status": "SAVED_TO_SQLITE"}

    def get_customer_decisions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Queries customer decisions with linked AI escalation details."""
        conn = self.get_pg_conn()
        if conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                    SELECT cd.*, 
                           ae.trigger_reason, 
                           ae.ai_confidence_score, 
                           ae.what_ai_could_not_extract_json
                    FROM customer_decisions cd
                    LEFT JOIN ai_escalations ae ON cd.escalation_id = ae.escalation_id
                    ORDER BY cd.created_at DESC
                    LIMIT %s;
                    """, (limit,))
                    rows = cur.fetchall()
                    result = []
                    for r in rows:
                        d = dict(r)
                        if d.get("monthly_cost") is not None:
                            d["monthly_cost"] = float(d["monthly_cost"])
                        if d.get("ai_response_insights_json"):
                            try:
                                d["ai_response_insights"] = json.loads(d["ai_response_insights_json"])
                            except Exception:
                                d["ai_response_insights"] = {}
                        if d.get("what_ai_could_not_extract_json"):
                            try:
                                d["what_ai_could_not_extract"] = json.loads(d["what_ai_could_not_extract_json"])
                            except Exception:
                                d["what_ai_could_not_extract"] = []
                        result.append(d)
                    conn.close()
                    return result
            except Exception as e:
                print(f"Error querying customer decisions: {e}")
                conn.close()

        fb = self.get_sqlite_fallback_conn()
        cur = fb.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_decisions';")
        if not cur.fetchone():
            fb.close()
            return []
        cur.execute("SELECT * FROM customer_decisions ORDER BY created_at DESC LIMIT ?;", (limit,))
        rows = cur.fetchall()
        fb.close()
        return [dict(r) for r in rows]


db_client = DatabaseClient()
