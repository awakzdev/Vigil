from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core.client_ip import client_ip_from_request
from app.services.evidence_vault import vault_config
from app.services.pack_signing import public_key_base64, signing_enabled

router = APIRouter()


class ClientIpOut(BaseModel):
    ip: str | None


@router.get("/client-ip", response_model=ClientIpOut)
def get_client_ip(request: Request) -> ClientIpOut:
    """Public IP of the browser session (for copy-paste remediation commands)."""
    return ClientIpOut(ip=client_ip_from_request(request))


class SigningKeyOut(BaseModel):
    enabled: bool
    key_id: str
    algorithm: str
    public_key_base64: str | None = None


class EvidenceVaultStatusOut(BaseModel):
    enabled: bool
    configured: bool
    s3_uri: str | None = None
    retention_days: int | None = None
    object_lock_mode: str | None = None
    auditor_access_mode: str | None = None
    implementation: str = "plan_only"


@router.get("/evidence-vault-status", response_model=EvidenceVaultStatusOut)
def evidence_vault_status() -> EvidenceVaultStatusOut:
    cfg = vault_config()
    loc = cfg["location"]
    return EvidenceVaultStatusOut(
        enabled=bool(cfg["enabled"]),
        configured=loc is not None,
        s3_uri=loc.base_uri if loc else None,
        retention_days=int(cfg["retention_days"]) if loc else None,
        object_lock_mode=cfg["object_lock_mode"].value if loc else None,
        auditor_access_mode=cfg["auditor_access_mode"].value if loc else None,
    )


@router.get("/evidence-pack-signing-key", response_model=SigningKeyOut)
def evidence_pack_signing_key() -> SigningKeyOut:
    """Public key for verifying pack_signature.json in evidence ZIPs."""
    return SigningKeyOut(
        enabled=signing_enabled(),
        key_id="vigil-evidence-v1",
        algorithm="ed25519",
        public_key_base64=public_key_base64(),
    )
