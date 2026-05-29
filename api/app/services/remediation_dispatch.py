"""Build EventBridge payloads for customer-hosted remediation Lambda."""
from __future__ import annotations

import json
import shlex
from typing import Any

import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Finding
from app.services.remediation_execution_store import record_dispatch
from app.services.remediation_iam import inline_policy_document
from app.services.remediation_plan import build_approved_remediation_plan


def build_remediation_dispatch(
    finding: Finding,
    *,
    approved_by: str,
    db: Session | None = None,
    org_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Return plan + EventBridge event + CLI for the customer account executor."""
    plan = build_approved_remediation_plan(finding, approved_by=approved_by)
    settings = get_settings()
    bus_region = settings.REMEDIATION_EVENT_BUS_REGION
    bus_name = settings.REMEDIATION_EVENT_BUS_NAME
    resource_region = plan.get("resource_region") or "us-east-1"

    detail = json.dumps(plan, separators=(",", ":"))
    entry: dict[str, Any] = {
        "Source": "vigil.security",
        "DetailType": "vigil.remediation.approved",
        "Detail": detail,
    }
    if bus_name and bus_name != "default":
        entry["EventBusName"] = bus_name

    cli_entries = json.dumps([entry])
    put_events_cli = (
        f"aws events put-events --region {shlex.quote(bus_region)} "
        f"--entries {shlex.quote(cli_entries)}"
    )

    execution_webhook_url = f"{settings.API_PUBLIC_URL.rstrip('/')}/v1/public/remediation-execution"

    if db is not None and org_id is not None:
        record_dispatch(
            db,
            plan=plan,
            org_id=org_id,
            finding_id=finding.id,
            account_id=finding.account_id,
        )

    return {
        "plan": plan,
        "plan_id": plan.get("plan_id"),
        "execution_webhook_url": execution_webhook_url,
        "event_bus_region": bus_region,
        "event_bus_name": bus_name,
        "resource_region": resource_region,
        "iam_inline_policy": inline_policy_document(finding.check_id),
        "signing_public_key_base64": (plan.get("signature") or {}).get("public_key_base64"),
        "eventbridge": {
            "source": entry["Source"],
            "detail_type": entry["DetailType"],
            "detail": plan,
            "bus_region": bus_region,
            "bus_name": bus_name,
        },
        "cli": {
            "put_events": put_events_cli,
        },
        "cfn_template_url": settings.CFN_REMEDIATION_TEMPLATE_URL,
        "instructions": [
            "1. Deploy/update infra/cfn/vigil-remediation-runner-ec2.yaml in event_bus_region "
            f"({bus_region}) — not necessarily the resource region ({resource_region}).",
            "2. Set stack parameter RemediationSigningPublicKeyBase64 from signing_public_key_base64 below (optional).",
            "3. Run put-events CLI (uses event bus region). Lambda calls EC2 in resource_region.",
            "4. Plan expires — publish a fresh plan after re-scan if rules changed.",
            "5. CloudWatch: expect exact revokes or stale_plan / plan_expired errors.",
        ],
    }
