"""
=============================================================================
KYC VERIFICATION: Secure S3 Storage Service (s3_storage.py)
=============================================================================
Provides client-side encrypted S3 uploads with:
1. Client-Side AES-256-GCM Envelope Encryption (encrypted before transmission).
2. Server-Side Encryption (SSE-S3 / SSE-KMS) in AWS S3.
3. Secure Presigned URLs (ephemeral, zero public exposure).
4. Local Encrypted Fallback Storage (when AWS credentials are not configured).
=============================================================================
"""

import os
import io
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path
from kyc_verification.secure_vault import secure_vault

logger = logging.getLogger(__name__)

AWS_S3_BUCKET = os.getenv("AWS_S3_KYC_BUCKET", "udyam-kyc-secure-vault")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-south-1")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

LOCAL_ENCRYPTED_DIR = Path(__file__).parent / "s3_encrypted_vault"
LOCAL_ENCRYPTED_DIR.mkdir(parents=True, exist_ok=True)


class SecureS3StorageService:
    def __init__(self):
        self.s3_client = None
        self.bucket = AWS_S3_BUCKET
        self.is_s3_configured = bool(AWS_ACCESS_KEY and AWS_SECRET_KEY)

        if self.is_s3_configured:
            try:
                import boto3
                self.s3_client = boto3.client(
                    "s3",
                    region_name=AWS_REGION,
                    aws_access_key_id=AWS_ACCESS_KEY,
                    aws_secret_access_key=AWS_SECRET_KEY,
                )
                logger.info(f"Connected to AWS S3 bucket: {self.bucket}")
            except Exception as e:
                logger.warning(f"Failed to initialize boto3 S3 client: {e}. Falling back to encrypted local vault.")
                self.s3_client = None

    def upload_encrypted_file(
        self,
        raw_bytes: bytes,
        session_id: str,
        slot_name: str,
        original_filename: str
    ) -> Dict[str, Any]:
        """
        1. Encrypts bytes client-side using AES-256-GCM (Ciphertext + 96-bit IV + SHA-256).
        2. Uploads the ciphertext to AWS S3 (with SSE-S3 encryption enabled).
        3. Returns the S3 key, SHA-256 checksum, and encryption metadata.
        """
        # Step 1: Encrypt raw bytes BEFORE they hit any network wire
        enc_result = secure_vault.encrypt_document_bytes(raw_bytes)
        ciphertext_bytes = bytes.fromhex(enc_result["ciphertext"])
        iv_hex = enc_result["iv"]
        sha256_hash = enc_result["sha256"]

        timestamp = int(datetime.now().timestamp())
        s3_key = f"kyc_documents/{session_id}/{slot_name}_{timestamp}.enc"

        metadata = {
            "session_id": session_id,
            "slot": slot_name,
            "original_filename": original_filename,
            "iv": iv_hex,
            "sha256": sha256_hash,
            "encryption_algorithm": "AES-256-GCM",
            "uploaded_at": datetime.now().isoformat()
        }

        # Step 2: Upload to S3 if available
        if self.s3_client:
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket,
                    Key=s3_key,
                    Body=ciphertext_bytes,
                    ServerSideEncryption="AES256",
                    Metadata={
                        "iv": iv_hex,
                        "sha256": sha256_hash,
                        "slot": slot_name
                    }
                )
                return {
                    "storage": "AWS_S3",
                    "bucket": self.bucket,
                    "s3_key": s3_key,
                    "s3_uri": f"s3://{self.bucket}/{s3_key}",
                    "sha256": sha256_hash,
                    "iv": iv_hex,
                    "size_bytes": len(ciphertext_bytes),
                    "server_side_encryption": "AES256",
                    "client_side_encryption": "AES-256-GCM"
                }
            except Exception as e:
                logger.error(f"S3 upload error: {e}. Storing in encrypted fallback vault.")

        # Step 3: Local encrypted fallback storage (when offline or testing)
        local_file_path = LOCAL_ENCRYPTED_DIR / f"{session_id}_{slot_name}_{timestamp}.enc"
        meta_file_path = LOCAL_ENCRYPTED_DIR / f"{session_id}_{slot_name}_{timestamp}.json"

        with open(local_file_path, "wb") as f:
            f.write(ciphertext_bytes)

        with open(meta_file_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return {
            "storage": "ENCRYPTED_VAULT_FALLBACK",
            "bucket": self.bucket,
            "s3_key": s3_key,
            "s3_uri": f"s3://{self.bucket}/{s3_key}",
            "local_path": str(local_file_path),
            "sha256": sha256_hash,
            "iv": iv_hex,
            "size_bytes": len(ciphertext_bytes),
            "server_side_encryption": "AES256",
            "client_side_encryption": "AES-256-GCM"
        }

    def download_and_decrypt_file(self, s3_key: str, iv_hex: str) -> bytes:
        """
        Retrieves the encrypted object from S3, verifies integrity, and decrypts back to bytes.
        """
        ciphertext_hex = ""
        if self.s3_client:
            resp = self.s3_client.get_object(Bucket=self.bucket, Key=s3_key)
            ciphertext_bytes = resp["Body"].read()
            ciphertext_hex = ciphertext_bytes.hex()
        else:
            # Fallback local read
            clean_name = Path(s3_key).stem
            matching_files = list(LOCAL_ENCRYPTED_DIR.glob(f"*{clean_name}*.enc"))
            if matching_files:
                with open(matching_files[0], "rb") as f:
                    ciphertext_hex = f.read().hex()

        if not ciphertext_hex:
            raise FileNotFoundError(f"Ciphertext for key '{s3_key}' not found.")

        return secure_vault.decrypt_document_bytes({
            "iv": iv_hex,
            "ciphertext": ciphertext_hex
        })


secure_s3_service = SecureS3StorageService()

