"""Build SSM Automation execution payloads for customer-hosted remediation."""
from __future__ import annotations

import json
import shlex
from typing import Any

import uuid

from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.core.config import get_settings
from app.models import AwsAccount, Finding
from app.services.remediation_execution_store import record_automation_start, record_dispatch
from app.services.remediation_iam import inline_policy_document
from app.services.remediation_plan import build_approved_remediation_plan
from app.services.ssm_remediation_catalog import (
    automation_parameters_for_plan,
    runbook_for_check,
    runbook_payload,
)


def build_remediation_dispatch(
    finding: Finding,
    *,
    approved_by: str,
    db: Session | None = None,
    org_id: uuid.UUID | None = None,
    execute: bool = False,
) -> dict[str, Any]:
    """Return approved plan; start SSM Automation only when execute=True."""
    plan = build_approved_remediation_plan(finding, approved_by=approved_by)
    settings = get_settings()
    automation_region = settings.REMEDIATION_AUTOMATION_REGION
    runbook = runbook_for_check(finding.check_id)
    document_name = (runbook.document_name if runbook else None) or settings.REMEDIATION_SSM_DOCUMENT_NAME
    resource_region = plan.get("resource_region") or "us-east-1"

    detail = json.dumps(plan, separators=(",", ":"))
    parameters = automation_parameters_for_plan(detail, runbook) if runbook else {"PlanJson": [detail]}
    ssm_parameters = json.dumps(parameters)
    start_automation_cli = (
        f"aws ssm start-automation-execution --region {shlex.quote(automation_region)} "
        f"--document-name {shlex.quote(document_name)} "
        f"--parameters {shlex.quote(ssm_parameters)}"
    )

    if db is not None and org_id is not None:
        record_dispatch(
            db,
            plan=plan,
            org_id=org_id,
            finding_id=finding.id,
            account_id=finding.account_id,
        )

    automation_execution_id: str | None = None
    automation_error: str | None = None
    if execute and db is not None:
        acc = db.get(AwsAccount, finding.account_id)
        if acc and acc.role_arn:
            try:
                sess = assume_role(
                    acc.role_arn,
                    acc.external_id,
                    session_name="vigil-remediation-ssm",
                    aws_account=acc,
                    purpose="start_remediation_automation",
                )
                resp = sess.client("ssm", region_name=automation_region).start_automation_execution(
                    DocumentName=document_name,
                    Parameters=parameters,
                )
                automation_execution_id = resp.get("AutomationExecutionId")
                if automation_execution_id and org_id is not None:
                    record_automation_start(
                        db,
                        plan_id=str(plan.get("plan_id")),
                        automation_execution_id=automation_execution_id,
                        document_name=document_name,
                        region=automation_region,
                    )
            except Exception as exc:  # noqa: BLE001
                automation_error = str(exc)

    return {
        "plan": plan,
        "plan_id": plan.get("plan_id"),
        "automation_region": automation_region,
        "document_name": document_name,
        "resource_region": resource_region,
        "iam_inline_policy": inline_policy_document(finding.check_id),
        "signing_public_key_base64": (plan.get("signature") or {}).get("public_key_base64"),
        "ssm": {
            "document_name": document_name,
            "automation_region": automation_region,
            "parameters": parameters,
            "started": automation_execution_id is not None,
            "automation_execution_id": automation_execution_id,
            "error": automation_error,
            "runbook": runbook_payload(runbook) if runbook else None,
        },
        "automation_execution_id": automation_execution_id,
        "automation_error": automation_error,
        "cli": {
            "start_automation": start_automation_cli,
        },
        "cfn_template_url": settings.CFN_REMEDIATION_SSM_TEMPLATE_URL,
        "prepared": True,
        "executed": automation_execution_id is not None,
        "instructions": [
            "Update the Vigil connector stack with the SSM remediation module for this finding family.",
            "When execute=true, Vigil calls ssm:StartAutomationExecution using the connector role.",
            "Plan expires — prepare again after re-scan if the resource changed.",
        ],
    }
