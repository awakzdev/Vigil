"""IaC routes: remediation patch preview + deterministic security lint (deepsearch v5).

Three endpoints:
  * POST /terraform/preview-patch — match a finding to Terraform, emit a deterministic patch.
  * POST /scan                    — native security lint (+ optional Checkov/tfsec) over pasted
                                    files or a connected GitHub repo.
  * POST /webhook/github          — HMAC-verified push/PR trigger that scans changed .tf/.hcl.

Read-only boundary: every path analyzes *source text only*. Nothing here writes to AWS or mutates
a customer repo; the webhook reports findings, humans decide.
"""
from __future__ import annotations

import json
import uuid

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import current_principal
from app.models.github import IdentityProvider, Repo
from app.services.github_repo_tf import fetch_terraform_files
from app.services.github_webhook import changed_iac_paths, event_context, verify_github_signature
from app.services.hcl_patch import hcl_patch_preview
from app.services.iac_external_scan import combined_scan

router = APIRouter()

_ALLOWED_ENGINES = {"checkov", "tfsec"}


class TfFileIn(BaseModel):
    path: str = "main.tf"
    content: str


class TerraformPreviewIn(BaseModel):
    check_id: str
    bucket_name: str | None = None
    files: list[TfFileIn] = Field(default_factory=list, max_length=20)


class IacScanIn(BaseModel):
    files: list[TfFileIn] = Field(default_factory=list, max_length=40)
    repo: str | None = None  # owner/name — fetch from the org's connected GitHub integration
    ref: str | None = None
    engines: list[str] = Field(default_factory=list, max_length=2)  # optional: checkov / tfsec


@router.post("/terraform/preview-patch")
def terraform_preview_patch(body: TerraformPreviewIn):
    """Match a finding to Terraform resources in pasted file(s). No Git clone yet."""
    files = [{"path": f.path, "content": f.content} for f in body.files]
    return hcl_patch_preview(
        check_id=body.check_id,
        bucket_name=body.bucket_name,
        files=files,
    )


def _github_provider_for_org(db: Session, org_id: str) -> IdentityProvider | None:
    return db.scalars(
        select(IdentityProvider).where(
            IdentityProvider.org_id == uuid.UUID(org_id),
            IdentityProvider.type == "github",
        )
    ).first()


@router.post("/scan")
def iac_scan(body: IacScanIn, p=Depends(current_principal), db: Session = Depends(get_db)):
    """Run the native deterministic IaC lint (+ optional external engines) over pasted files or a repo.

    Native rules are always on; ``engines`` opt into Checkov/tfsec, which only add findings. Returns a
    severity-sorted summary with per-engine availability so a CI gate can fail on the highest severity.
    """
    files = [{"path": f.path, "content": f.content} for f in body.files]
    if body.repo:
        provider = _github_provider_for_org(db, p["org_id"])
        if not provider:
            raise HTTPException(status_code=400, detail="No connected GitHub integration for this org")
        try:
            files = fetch_terraform_files(provider, body.repo, ref=body.ref)
        except (ValueError, httpx.HTTPError) as e:
            raise HTTPException(status_code=400, detail=f"Could not fetch repo Terraform: {e}")
    if not files:
        raise HTTPException(status_code=400, detail="No Terraform/HCL files supplied or found")
    engines = [e for e in body.engines if e in _ALLOWED_ENGINES]
    return combined_scan(files, engines)


@router.post("/webhook/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Inbound GitHub push/PR webhook → scan changed .tf/.hcl. HMAC-verified (fail closed), read-only.

    Registering this URL in GitHub and posting results back as a PR check/comment are deploy-time
    steps (needs the webhook secret + a write-scoped token); this endpoint verifies, parses, fetches
    and scans, returning the structured result.
    """
    settings = get_settings()
    raw = await request.body()
    if not verify_github_signature(settings.GITHUB_WEBHOOK_SECRET, raw, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="invalid or missing signature")
    try:
        event = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid JSON payload")

    if x_github_event not in ("push", "pull_request"):
        return {"status": "ignored", "reason": f"event '{x_github_event}' not handled"}

    ctx = event_context(event)
    changed = changed_iac_paths(event)
    if not ctx["repo"]:
        return {"status": "ignored", "reason": "no repository in payload"}
    if x_github_event == "push" and not changed:
        return {"status": "ignored", "reason": "no .tf/.hcl changes in push", **ctx}

    repo_row = db.scalars(select(Repo).where(Repo.name == ctx["repo"])).first()
    provider = db.get(IdentityProvider, repo_row.provider_id) if repo_row else None
    if not provider:
        return {
            "status": "accepted",
            "reason": "repo not linked to a connected provider; scan skipped",
            "changed_iac_paths": changed,
            **ctx,
        }
    try:
        files = fetch_terraform_files(provider, ctx["repo"], ref=ctx["branch"])
    except (ValueError, httpx.HTTPError) as e:
        return {"status": "error", "reason": f"fetch failed: {e}", **ctx}

    return {
        "status": "scanned",
        "changed_iac_paths": changed,
        "result": combined_scan(files, []),
        **ctx,
    }
