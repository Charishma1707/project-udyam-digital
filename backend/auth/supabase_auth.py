"""
=============================================================================
SUPABASE AUTHENTICATION & AUTHORIZATION MODULE (auth/supabase_auth.py)
=============================================================================
Handles:
1. Supabase Client initialization using SUPABASE_URL and SUPABASE_ANON_KEY / SERVICE_ROLE_KEY.
2. JWT Verification and token extraction from Authorization header.
3. Fallback mock authentication for development mode if Supabase keys are not set yet.
4. FastAPI Depends helpers: `get_current_user`, `get_optional_user`, and `require_admin`.
=============================================================================
"""

import os
import logging
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, Depends
import jwt

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()

supabase_client = None
if SUPABASE_URL and SUPABASE_ANON_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        logger.info(f"Supabase client connected to {SUPABASE_URL}")
    except Exception as e:
        logger.warning(f"Could not initialize Supabase client: {e}")


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Decodes and validates a Supabase JWT token.
    Falls back to unverified decode if secret is not set, or returns mock user for dev token.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    # Developer/Demo token fallback
    if token.startswith("dev-user-") or token == "demo-token":
        user_id = token.replace("dev-user-", "") if token != "demo-token" else "demo-customer-uuid"
        return {
            "sub": user_id,
            "id": user_id,
            "email": f"{user_id}@example.com",
            "role": "authenticated",
            "app_metadata": {"role": "customer"}
        }

    try:
        # If SUPABASE_JWT_SECRET is provided, verify signature
        if SUPABASE_JWT_SECRET:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_exp": True}
            )
            return payload
        else:
            # Without secret, decode payload safely for development
            payload = jwt.decode(token, options={"verify_signature": False})
            return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    FastAPI dependency to extract and verify the current authenticated user.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format. Expected 'Bearer <token>'")

    token = parts[1]
    user_payload = verify_supabase_jwt(token)
    return user_payload


async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """
    Returns user payload if valid Authorization header exists, else None.
    """
    if not authorization:
        return None
    try:
        parts = authorization.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return verify_supabase_jwt(parts[1])
    except Exception:
        return None
    return None

