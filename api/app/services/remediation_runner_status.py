"""Verify customer-account SSM remediation automation (read-only)."""
from __future__ import annotations

from typing import Any

from botocore.exceptions import ClientError

from app.core.config import get_settings
from app.core.aws import assume_role
from app.models import AwsAccount

DOCUMENT_NAME = "Vigil-RemediationPlanExecutor"


def check_remediation_runner(acc: AwsAccount, *, check_id: str | None = None) -> dict[str, Any]:
    """
    Inspect SSM Automation readiness in the remediation region (connector can describe/start).
    """
    from app.services.ssm_remediation_catalog import runbook_for_check

    settings = get_settings()
    automation_region = settings.REMEDIATION_AUTOMATION_REGION
    runbook = runbook_for_check(check_id) if check_id else None
    document_name = (
        runbook.document_name
        if runbook
        else (settings.REMEDIATION_SSM_DOCUMENT_NAME or DOCUMENT_NAME)
    )

    out: dict[str, Any] = {
        "automation_region": automation_region,
        "document": {"name": document_name, "exists": False, "status": None},
        "ready": False,
        "rule": {"name": document_name, "exists": False, "state": None},
        "lambda": {"name": None, "exists": False, "deprecated": True},
        "schema_discovery": {"enabled": None, "note": "SSM Automation only — no Lambda runner"},
        "blockers": [],
        "warnings": [],
        "hints": [],
    }

    if not acc.role_arn:
        out["blockers"].append("AWS account role not verified — connect account first")
        return out

    try:
        sess = assume_role(
            acc.role_arn,
            acc.external_id,
            session_name="vigil-remediation-check",
            aws_account=acc,
            purpose="remediation_runner_status",
        )
    except Exception as exc:  # noqa: BLE001
        out["blockers"].append(f"Cannot assume role: {exc}")
        return out

    ssm = sess.client("ssm", region_name=automation_region)
    try:
        doc = ssm.describe_document(Name=document_name)
        status = (doc.get("Document") or {}).get("Status")
        out["document"]["exists"] = True
        out["document"]["status"] = status
        out["rule"]["exists"] = True
        out["rule"]["state"] = status
        if status not in (None, "Active"):
            out["blockers"].append(f"SSM document {document_name} exists but Status={status}")
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("InvalidDocument", "InvalidDocumentOperation"):
            out["blockers"].append(
                f"SSM Automation document {document_name} not found in {automation_region} — deploy vigil-remediation-ssm.yaml"
            )
        else:
            out["blockers"].append(f"Cannot describe SSM document: {e}")

    out["ready"] = not out["blockers"] and out["document"].get("exists")
    if runbook and runbook.owner == "aws":
        out["warnings"].append(
            f"AWS-owned runbook {document_name} — no Vigil custom document required."
        )
    elif runbook and runbook.owner == "vigil":
        out["hints"].append(
            "Custom Vigil document: deploy infra/cfn/vigil-remediation-ssm.yaml in "
            f"{automation_region} when this check uses Vigil-RemediationPlanExecutor."
        )

    if out["ready"]:
        out["hints"] = [
            *out["hints"],
            f"SSM remediation ready in {automation_region}. Approve on the finding, then start automation.",
            "Re-scan after remediation so the next plan matches live resources.",
        ]
    else:
        out["hints"] = [
            *out["hints"],
            "Update the Vigil connector stack (vigil-stack / core scanner) with SSM remediation modules enabled.",
            f"Connector needs ssm:DescribeDocument and ssm:StartAutomationExecution in {automation_region}.",
            f"Set REMEDIATION_AUTOMATION_REGION={automation_region} in Vigil .env to match the document region.",
        ]
    return out
