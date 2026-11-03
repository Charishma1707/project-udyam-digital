"""
=============================================================================
AIRTEL BUSINESS - PROJECT UDYAM DIGITAL
Main Application Server (main.py)
=============================================================================
FastAPI server connecting the agentic customer discovery pipeline,
recommendation engine, smart KYC verification, and order tracking.

Run locally:
    python main.py
Or with uvicorn:
    uvicorn main:app --reload --port 8000
=============================================================================
"""

import sys
import os
from pathlib import Path
from typing import Optional, Dict, Any

# Ensure stdout uses UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Modular package imports
from schema.customer_profile import CustomerSchema
from schema.api_models import (
    ChatRequest,
    QuoteAcceptRequest,
    QuoteRejectRequest,
    OrderStatusUpdateRequest,
    WhatIfRequest,
    SegmentResolveRequest,
)
from agent.discovery_agent import discovery_agent
from agent.session_memory import session_memory
from agent.question_planner import QuestionPlanner
from data_preprocessing.city_tier_mapping import city_tier_service
from data_preprocessing.business_segment_mapper import business_segment_mapper
from data_preprocessing.etl_pipeline import run_etl
from recommendation.bundle_engine import bundle_engine
from kyc_verification.smart_kyc_service import smart_kyc_service
from kyc_verification.smart_kyc_verifier import smart_kyc_verifier, find_applicant_files
from order_tracking.order_lifecycle import order_lifecycle_service
from database.db_client import db_client

app = FastAPI(
    title="Airtel Business Customer Discovery & Smart KYC Platform",
    description="Enterprise Conversational AI Advisor, 11-Stage Pipeline Visualizer, and Smart Digital KYC Engine.",
    version="2.0.0"
)

# Enable CORS for browser UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# =============================================================================
# 1. CONVERSATION DISCOVERY (CHAT & SPEECH)
# =============================================================================

@app.post("/chat")
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Receives customer text message and runs the 11-stage discovery pipeline.
    """
    result = discovery_agent.process_turn(
        message=request.message,
        session_id=request.session_id
    )
    return JSONResponse(content=result)


@app.post("/voice")
@app.post("/api/voice")
async def voice_endpoint(
    audio: UploadFile = File(...),
    session_id: Optional[str] = Form(None)
):
    """
    Accepts spoken audio recordings, converts via Sarvam STT, and updates profile.
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file uploaded.")

    result = discovery_agent.process_turn(
        message="",
        session_id=session_id,
        audio_bytes=audio_bytes,
        filename=audio.filename or "recording.wav",
        mime_type=audio.content_type or "audio/wav"
    )
    return JSONResponse(content=result)


# =============================================================================
# 2. SESSION MANAGEMENT
# =============================================================================

@app.get("/session/{session_id}")
@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Fetches customer schema and conversation history for an active session."""
    session = session_memory.get_or_create(session_id)
    detection = QuestionPlanner.detect_missing_fields(session.schema)
    completion_pct = QuestionPlanner.calculate_completion_percentage(session.schema)

    return {
        "session_id": session_id,
        "customer_schema": session.schema.to_dict(),
        "missing_fields": detection["missing_fields"],
        "ready_for_recommendation": detection["schema_complete"],
        "completion_percentage": completion_pct,
        "conversation_history": session.history
    }


@app.post("/reset/{session_id}")
@app.post("/api/reset/{session_id}")
async def reset_session(session_id: str):
    """Resets session back to initial empty state."""
    session_memory.reset(session_id)
    return {"status": "reset_successful", "session_id": session_id}


# =============================================================================
# 3. PHASE 2: RECOMMENDATION ENGINE & WHAT-IF SIMULATIONS
# =============================================================================

@app.post("/api/recommend")
async def generate_recommendations(payload: Dict[str, Any]):
    """Generates tailored Airtel solution bundles for a customer profile."""
    raw = payload.get("schema") or payload
    schema = CustomerSchema(**raw)
    recs = bundle_engine.generate_recommendations(schema)
    return recs


@app.get("/api/recommend/{session_id}")
async def get_session_recommendations(session_id: str):
    """Retrieves recommendations for an ongoing discovery session."""
    session = session_memory.get_or_create(session_id)
    recs = bundle_engine.generate_recommendations(session.schema)
    session.recommendations = recs
    return recs


@app.post("/api/recommend/what-if")
async def simulate_what_if(request: WhatIfRequest):
    """Simulates GSTIN addition and installation timeline adjustments."""
    session = session_memory.get_or_create(request.session_id) if request.session_id else None
    base_data = session.schema.to_dict() if session else (request.schema_data or {})

    schema = CustomerSchema(**base_data)
    if request.max_installation_days is not None:
        schema.max_installation_days = request.max_installation_days
    if request.has_gstin is not None:
        schema.has_gstin = request.has_gstin
    if request.gstin is not None:
        schema.gstin = request.gstin

    recs = bundle_engine.generate_recommendations(schema)
    return {
        "simulation_params": request.model_dump(),
        "recommendations": recs
    }


@app.post("/api/segment/resolve")
async def resolve_segment(request: SegmentResolveRequest):
    """Deterministically maps business type to canonical enterprise segment."""
    return business_segment_mapper.resolve(request.business_type)


# =============================================================================
# 4. REGISTRY LOOKUPS & DATABASE EXPLORER
# =============================================================================

@app.get("/api/lookup/gstin/{gstin}")
async def lookup_gstin(gstin: str):
    """Validates GSTIN against 3,534+ government tax registry records."""
    record = db_client.find_gstin(gstin)
    if not record:
        raise HTTPException(status_code=404, detail="GSTIN not found in registry")
    return {"found": True, "record": record}


@app.get("/api/lookup/udyam/{udyam}")
async def lookup_udyam(udyam: str):
    """Validates Udyam registration number against 2,723+ MSME registry records."""
    record = db_client.find_udyam(udyam)
    if not record:
        raise HTTPException(status_code=404, detail="Udyam number not found in registry")
    return {"found": True, "record": record}


@app.get("/api/products")
async def get_products():
    """Returns all 25 normalized Airtel Business catalogue products."""
    prods = db_client.get_products()
    return {"count": len(prods), "products": prods}


@app.get("/api/bundles/statistics")
async def get_bundle_statistics():
    """Returns historical bundle popularity, conversion, and NPS statistics."""
    return {"count": len(db_client.bundle_statistics), "bundle_statistics": db_client.bundle_statistics}


@app.get("/api/products/statistics")
async def get_product_statistics():
    """Returns product-level activation and satisfaction statistics."""
    return {"count": len(db_client.product_statistics), "product_statistics": db_client.product_statistics}


@app.get("/api/database/status")
async def get_database_status():
    """Returns database connection state and cached table counts."""
    return db_client.get_status()


@app.get("/database")
async def serve_database_explorer():
    """Serves the interactive PostgreSQL Database Table Explorer HTML interface."""
    db_file = FRONTEND_DIR / "database.html"
    if db_file.exists():
        return FileResponse(str(db_file))
    return HTMLResponse("<h3>Database Explorer interface not found</h3>", status_code=404)


@app.get("/api/database/table/{name}")
async def get_table_data(name: str):
    """Returns rows from a specific database table for the table visualizer."""
    table = name.lower()
    if table == "product_catalogue":
        rows = db_client.get_products()
    elif table == "city_tier_mapping":
        rows = list(db_client.city_tiers.values())
    elif table == "gstin_registry":
        rows = list(db_client.gstin_registry.values())[:500]
    elif table == "udyam_registry":
        rows = list(db_client.udyam_registry.values())[:500]
    elif table == "smb_leads":
        rows = list(db_client.leads.values())[:500]
    elif table == "bundle_statistics":
        rows = db_client.bundle_statistics
    elif table == "product_statistics":
        rows = db_client.product_statistics
    else:
        rows = []

    return {"count": len(rows), "source": "In-Memory Database Store", "rows": rows}


# =============================================================================
# 5. PHASE 3 & 4: SMART DIGITAL KYC & ORDER TRACKING
# =============================================================================

@app.post("/api/kyc/upload")
async def upload_kyc(
    file: UploadFile = File(...),
    doc_type: str = Form("gstin"),
    session_id: str = Form("session-1"),
    expected_name: Optional[str] = Form(None)
):
    """Encrypts document buffer, extracts identifiers, and verifies registry."""
    buf = await file.read()
    return smart_kyc_service.process_document(
        buffer=buf,
        doc_type=doc_type,
        session_id=session_id,
        expected_name=expected_name
    )


@app.get("/api/kyc/applicants")
async def list_kyc_applicants():
    """Returns all available test applicants in the dataset (K01 to K12)."""
    kyc_dir = BASE_DIR / "YTL_TrackA_Udyam_Digital_Data" / "kyc_documents"
    applicants = []
    for i in range(1, 13):
        app_id = f"K{i:02d}"
        files = find_applicant_files(str(kyc_dir), app_id)
        valid_files = {k: v for k, v in files.items() if v}
        if valid_files:
            applicants.append({
                "applicant_id": app_id,
                "document_count": len(valid_files),
                "slots": list(valid_files.keys())
            })
    return {"count": len(applicants), "applicants": applicants}


@app.post("/api/kyc/verify-applicant/{applicant_id}")
async def verify_applicant(applicant_id: str):
    """Executes SmartKYCVerifier (OCR + multi-tier checks) for applicant K01-K12."""
    kyc_dir = BASE_DIR / "YTL_TrackA_Udyam_Digital_Data" / "kyc_documents"
    files = find_applicant_files(str(kyc_dir), applicant_id.upper())
    valid_files = {k: v for k, v in files.items() if v}
    if not valid_files:
        raise HTTPException(status_code=404, detail=f"No KYC documents found for applicant {applicant_id}")
    
    result = smart_kyc_verifier.verify_customer(applicant_id.upper(), files)
    return result



@app.post("/api/orders/accept")
async def accept_order(request: QuoteAcceptRequest):
    """Generates SLA contract and initializes 5-milestone order tracker."""
    return order_lifecycle_service.accept_quote(
        session_id=request.sessionId,
        bundle_code=request.bundleCode,
        bundle_name=request.bundleName,
        monthly_cost=request.monthlyCost,
        contract_months=request.contractMonths,
        customer_schema=request.customerSchema
    )


@app.post("/api/orders/reject")
async def reject_order(request: QuoteRejectRequest):
    """Captures drop reasons and counter-offers for sales managers."""
    return order_lifecycle_service.reject_quote(
        session_id=request.sessionId,
        bundle_code=request.bundleCode,
        rejection_reason=request.rejectionReason,
        customer_feedback=request.customerFeedback,
        budget_offered=request.budgetOffered
    )


@app.get("/api/orders/{order_id}")
async def get_order_tracking(order_id: str):
    """Retrieves order tracking milestones for a customer or sales agent."""
    order = order_lifecycle_service.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.get("/api/orders")
async def get_all_orders():
    """Returns all placed customer orders from the database."""
    return {"orders": order_lifecycle_service.get_all_orders()}


@app.get("/api/sales/dashboard")
async def get_sales_dashboard():
    """Returns Sales Command Center KPIs, active escalations, and lost quote log."""
    return order_lifecycle_service.get_sales_dashboard()


@app.post("/api/sales/orders/{order_id}/status")
@app.post("/api/orders/{order_id}/status")
@app.patch("/api/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: Dict[str, Any]):
    """Allows sales agent or admin to update milestones or toggle order status in DB."""
    updated = order_lifecycle_service.update_order_stage(order_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"success": True, "order": updated}


@app.post("/api/admin/messages/send")
async def send_admin_message(payload: Dict[str, Any]):
    """Allows Admin to send custom message, bundle recommendation, or response to user."""
    session_id = payload.get("session_id") or "default_session"
    customer_name = payload.get("customer_name") or "Valued Customer"
    msg_text = payload.get("message") or ""
    bundle_code = payload.get("bundle_code")
    return order_lifecycle_service.send_admin_message(
        session_id=session_id,
        customer_name=customer_name,
        message=msg_text,
        bundle_code=bundle_code
    )


@app.get("/api/user/messages/{session_id}")
async def get_user_messages(session_id: str):
    """Retrieves messages sent by Admin to this customer."""
    msgs = order_lifecycle_service.get_customer_messages(session_id)
    return {"messages": msgs}


@app.post("/api/auth/login")
async def login(payload: Dict[str, Any]):
    """Simple role-based login (User or Admin)."""
    role = payload.get("role", "user").lower()
    email = payload.get("email", "guest@airtel.com")
    name = payload.get("name", "Airtel User" if role == "user" else "Airtel Operations Admin")
    return {
        "success": True,
        "token": f"token_{role}_{os.urandom(4).hex()}",
        "user": {
            "email": email,
            "name": name,
            "role": role
        }
    }


# =============================================================================
# 6. SYSTEM HEALTH & FRONTEND SERVING
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "backend": "Python (FastAPI + Pydantic v2)",
        "service": "Airtel Business Customer Discovery & Smart KYC Platform",
        "database_connected": True
    }


@app.get("/")
async def serve_index():
    """Serves the interactive single-page application React frontend."""
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return HTMLResponse("<h1>Airtel Business Discovery Agent</h1>")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    print(f">> Airtel Business Discovery Agent (Python FastAPI) running on http://localhost:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
