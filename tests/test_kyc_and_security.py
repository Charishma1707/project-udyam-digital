from kyc_verification.secure_vault import secure_vault
from kyc_verification.smart_kyc_service import smart_kyc_service

def test_aes_encryption_and_decryption():
    data = b"CONFIDENTIAL_TAX_DOCUMENT_STREAM"
    encrypted = secure_vault.encrypt_document_bytes(data)
    assert "iv" in encrypted
    assert "ciphertext" in encrypted

    decrypted = secure_vault.decrypt_document_bytes(encrypted)
    assert decrypted == data

def test_pii_masking():
    masked_gst = secure_vault.mask_pii("27XAAAC1234A1Z5", "gstin")
    assert masked_gst == "27XXXXXXXX4A1Z5"

    masked_udyam = secure_vault.mask_pii("UDYAM-00-1234567", "udyam")
    assert "XXXX" in masked_udyam

def test_kyc_verification():
    sample_bytes = b"Specimen GSTIN Certificate: 27XAAAC1234A1Z5 valid active"
    result = smart_kyc_service.process_document(sample_bytes, doc_type="gstin")
    assert result["doc_type"] == "gstin"
    assert "extracted_identifier" in result
    assert result["status"] in ["VERIFIED", "REJECTED"]
