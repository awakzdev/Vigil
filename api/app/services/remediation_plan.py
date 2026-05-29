"""Signed remediation plans for customer-hosted automation (read-only Vigil → customer executor)."""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import get_settings
from app.models import Finding
from app.services.pack_signing import sign_payload

PLAN_SCHEMA = "vigil_remediation_plan/v2"
SG_CHECKS = frozenset(
    {
        "ec2.security_group.unrestricted_ssh",
        "ec2.security_group.unrestricted_rdp",
    }
)


def _resource_region(finding: Finding) -> str:
    ev = finding.evidence or {}
    if isinstance(ev.get("region"), str) and ev["region"]:
        return ev["region"]
    arn = finding.resource_arn or ""
    m = re.search(r":([a-z0-9-]+):", arn)
    if m and m.group(1) not in ("aws", ""):
        return m.group(1)
    return "us-east-1"


def _supported_action(check_id: str) -> str | None:
    if check_id in SG_CHECKS:
        return "revoke_public_ingress"
    if check_id == "s3.bucket.public_access_not_blocked":
        return "put_public_access_block"
    return None


def _seal_remediation_plan(body: dict[str, Any]) -> dict[str, Any]:
    """Attach content_sha256 and optional signature over the canonical JSON body."""
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    body["content_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    sig = sign_payload(canonical.encode())
    if sig:
        body["signature"] = sig
    return body


def build_remediation_plan_body(
    finding: Finding,
    *,
    mode: str = "customer_lambda",
    delivery: str = "eventbridge",
) -> dict[str, Any]:
    """Unsigned plan body (preview). Seal with _seal_remediation_plan before dispatch."""
    settings = get_settings()
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    ttl = max(5, int(settings.REMEDIATION_PLAN_TTL_MINUTES))
    expires = now + timedelta(minutes=ttl)
    resource_region = _resource_region(finding)
    ev = finding.evidence or {}

    return {
        "plan_id": plan_id,
        "schema": PLAN_SCHEMA,
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "finding_id": str(finding.id),
        "check_id": finding.check_id,
        "resource_arn": finding.resource_arn,
        "resource_region": resource_region,
        "event_bus_region": settings.REMEDIATION_EVENT_BUS_REGION,
        "event_bus_name": settings.REMEDIATION_EVENT_BUS_NAME,
        "evidence": ev,
        "title": finding.title,
        "severity": finding.severity,
        "supported_action": _supported_action(finding.check_id),
        "exact_match_rules": list(ev.get("exposing_rules") or []),
        "execution": {
            "runner_type": "lambda",
            "mode": mode,
            "delivery": delivery,
            "note": (
                "Publish put-events to event_bus_region (where your runner stack lives). "
                "Lambda calls AWS APIs in resource_region. Deploy vigil-remediation-runner-ec2.yaml."
            ),
        },
        "steps": _steps_for_check(finding),
        "rollback_hint": "Revert via CloudFormation stack change set or restore prior policy version in IAM.",
    }


def build_remediation_plan(
    finding: Finding,
    *,
    mode: str = "customer_lambda",
    delivery: str = "eventbridge",
) -> dict[str, Any]:
    """Emit a remediation plan the customer automation can validate and execute (preview, no approval)."""
    return _seal_remediation_plan(build_remediation_plan_body(finding, mode=mode, delivery=delivery))


def build_approved_remediation_plan(
    finding: Finding,
    *,
    approved_by: str,
    mode: str = "customer_lambda",
    delivery: str = "eventbridge",
) -> dict[str, Any]:
    """Signed plan including approval block — use only when publishing to EventBridge."""
    body = build_remediation_plan_body(finding, mode=mode, delivery=delivery)
    now = datetime.now(timezone.utc)
    body["approval"] = {
        "approval_token": secrets.token_urlsafe(32),
        "approved_by": approved_by,
        "approved_at": now.isoformat(),
    }
    return _seal_remediation_plan(body)


def _steps_for_check(finding: Finding) -> list[dict[str, str]]:
    cid = finding.check_id
    if cid.startswith("s3."):
        return [
            {"action": "review", "detail": "Apply bucket policy / encryption from Finding drawer generated policy"},
            {"action": "execute", "detail": "Customer Lambda applies approved S3 API calls from plan payload"},
        ]
    if cid.startswith("iam."):
        return [
            {"action": "review", "detail": "Use generated least-privilege policy or detach unused policy"},
            {"action": "execute", "detail": "Customer Lambda applies IAM change after approval gate"},
        ]
    if cid in SG_CHECKS:
        return [
            {"action": "review", "detail": "Confirm exposing_rules in plan match the ingress you intend to remove"},
            {"action": "execute", "detail": "Publish EventBridge event to runner bus region, or use Console/CLI"},
        ]
    return [
        {"action": "review", "detail": "Follow Console/CLI remediation in Vigil finding drawer"},
        {"action": "execute", "detail": "Optional: wire customer automation when plan type is supported"},
    ]
