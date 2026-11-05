"""
=============================================================================
AIRTEL BUSINESS - PROJECT UDYAM DIGITAL
Root Application Launcher
=============================================================================
Usage:
    python run.py

This script starts the FastAPI backend server which simultaneously serves:
- Modern Frontend Single Page Application at: http://localhost:8000/
- Interactive OpenAPI / Swagger docs at:       http://localhost:8000/docs
- PostgreSQL Database Explorer at:            http://localhost:8000/database

Project Structure:
- backend/  : FastAPI, Discovery Agent, Smart KYC, Recommendation Engine & OMS
- frontend/ : Responsive Enterprise Web UI (HTML, CSS, JS)
- docs/     : Architecture specifications, evaluation reports & case study
=============================================================================
"""

import os
import sys
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"

def main():
    print("=" * 70)
    print("   AIRTEL BUSINESS - PROJECT UDYAM DIGITAL")
    print("   Conversational AI Discovery, Smart KYC & OMS Platform")
    print("=" * 70)
    print(f">> Backend Directory  : {BACKEND_DIR}")
    print(f">> Frontend Directory : {ROOT_DIR / 'frontend'}")
    print(f">> Docs Directory     : {ROOT_DIR / 'docs'}")
    print("-" * 70)
    print(">> Launching server on http://localhost:8000 ...")
    print(">> Press Ctrl+C to stop.")
    print("=" * 70)

    os.chdir(str(BACKEND_DIR))
    subprocess.run([
        sys.executable, "-m", "uvicorn", "main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload"
    ])

if __name__ == "__main__":
    main()

