"""Signed remediation plans for customer-hosted automation (read-only Vigil → customer executor)."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.models import Finding


def build_remediation_plan(
    finding: Finding,
    *,
    mode: str = "customer_lambda",
    delivery: str = "eventbridge",
) -> dict[str, Any]:
    """Emit a remediation plan the customer automation can validate and execute."""
    plan_id = str(uuid.uuid4())
    created = datetime.now(timezone.utc).isoformat()
    body = {
        "plan_id": plan_id,
        "schema": "vigil_remediation_plan/v1",
        "created_at": created,
        "finding_id": str(finding.id),
        "check_id": finding.check_id,
        "resource_arn": finding.resource_arn,
        "title": finding.title,
        "severity": finding.severity,
        "execution": {
            "mode": mode,
            "delivery": delivery,
            "note": (
                "Vigil does not mutate your account. Import infra/cfn/vigil-remediation-runner.yaml "
                "and subscribe the EventBridge rule to your account. Plans are approved in the Vigil UI "
                "before your Lambda assumes a narrow write role."
            ),
        },
        "steps": _steps_for_check(finding),
        "rollback_hint": "Revert via CloudFormation stack change set or restore prior policy version in IAM.",
    }
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    body["content_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    return body


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
    return [
        {"action": "review", "detail": "Follow Console/CLI remediation in Vigil finding drawer"},
        {"action": "execute", "detail": "Optional: wire customer automation when plan type is supported"},
    ]
