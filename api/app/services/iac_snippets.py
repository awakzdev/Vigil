"""Deterministic IaC / CLI snippets per finding (Phase 1 — no repo PR)."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.data.remediation_modules import REMEDIATION_MODULE_BY_ID, remediation_module_for_check
from app.models import AwsAccount, Finding
from app.models.github import IdentityProvider, Repo
from app.services.remediation_plan import _supported_action
from app.services.ssm_remediation_catalog import runbook_for_check, runbook_payload

IAC_NOT_AVAILABLE = "iac_not_available"
IAC_SNIPPETS = "iac_snippets"
IAC_AUTOMATION_ONLY = "automation_only"

SG_CHECKS = frozenset(
    {
        "ec2.security_group.unrestricted_ssh",
        "ec2.security_group.unrestricted_rdp",
    }
)

AUTOMATION_CHECKS = frozenset(
    {
        *SG_CHECKS,
        "ssm.parameter.plaintext_secret",
        "iam.access_key.unused_45d",
        "iam.access_key.unused_90d",
    }
)


def build_iac_remediation(db: Session, finding: Finding, org_id: uuid.UUID) -> dict[str, Any]:
    """Return terraform, cloudformation, and cli snippets for a finding."""
    cid = finding.check_id
    ev = finding.evidence or {}
    builder = _BUILDERS.get(cid, _generic)
    body = builder(finding, ev)
    body["check_id"] = cid
    body["finding_id"] = str(finding.id)
    body["resource_arn"] = finding.resource_arn
    body["phase"] = "snippets"
    github = _github_context(db, org_id)
    has_tf = bool(body.get("terraform"))
    body["pr_automation"] = {
        "available": False,
        "github_connected": github["github_connected"],
        "gitlab_connected": github["gitlab_connected"],
        "providers": github["providers"],
        "repos": github["repos"],
        "note": (
            "Version-control PR automation is paused until repo-aware HCL patching ships. "
            "Use declarative Terraform (S3/KMS) or SSM Automation for live changes."
        ),
    }
    from app.services.terraform_pr import PR_PATCH_CHECKS

    pr_ok = github["github_connected"] and cid in PR_PATCH_CHECKS
    body["apply_paths"] = {
        "terraform_pr": pr_ok,
        "terraform_generic": has_tf,
        "customer_automation": cid in AUTOMATION_CHECKS,
    }
    if pr_ok:
        body["pr_automation"]["available"] = True
        body["pr_automation"]["note"] = (
            "Opens a PR with hclpatch + terraform validate when you pick a connected repo."
        )
    ssm = _ssm_remediation_panel(db, finding)
    if ssm:
        body["ssm_remediation"] = ssm
    return body


_ACTION_LABELS: dict[str, str] = {
    "deactivate_access_key": "Disable access key",
    "revoke_public_ingress": "Revoke public ingress",
    "put_public_access_block": "Block public access",
    "migrate_ssm_string_to_secure_string": "Migrate parameter to SecureString",
}


def _ssm_remediation_panel(db: Session, finding: Finding) -> dict[str, Any] | None:
    cid = finding.check_id
    if cid not in AUTOMATION_CHECKS:
        return None
    module_id = remediation_module_for_check(cid)
    if not module_id:
        return None
    spec = REMEDIATION_MODULE_BY_ID[module_id]
    acc = db.get(AwsAccount, finding.account_id)
    enabled = deployed = False
    if acc:
        enabled = bool(getattr(acc, spec.enable_column))
        deployed = bool(getattr(acc, spec.deployed_column))
    action = _supported_action(cid)
    runbook = runbook_for_check(cid)
    from app.services.remediation_plan import automation_region_for_finding, resource_region_for_finding

    settings = get_settings()
    resource_region = resource_region_for_finding(finding)
    automation_region = automation_region_for_finding(finding)
    return {
        "module_id": module_id,
        "module_label": spec.label,
        "module_enabled": enabled,
        "module_deployed": deployed,
        "action": action,
        "action_label": _ACTION_LABELS.get(action or "", action or "Remediate"),
        "execution": "AWS Systems Manager Automation",
        "automation_role_name": settings.CFN_REMEDIATION_AUTOMATION_ROLE_NAME,
        "resource_region": resource_region,
        "automation_region": automation_region,
        "runbook": runbook_payload(runbook) if runbook else None,
        "requires_vigil_document": bool(runbook and runbook.owner == "vigil"),
    }


def _github_context(db: Session, org_id: uuid.UUID) -> dict[str, Any]:
    """Git + GitLab connection state for IaC UI (PR flow is GitHub-only when enabled)."""
    gh = db.scalar(
        select(IdentityProvider).where(
            IdentityProvider.org_id == org_id,
            IdentityProvider.type == "github",
            IdentityProvider.status == "connected",
        )
    )
    gl = db.scalar(
        select(IdentityProvider).where(
            IdentityProvider.org_id == org_id,
            IdentityProvider.type == "gitlab",
            IdentityProvider.status == "connected",
        )
    )
    providers: list[str] = []
    if gh:
        providers.append("github")
    if gl:
        providers.append("gitlab")
    repos: list[dict[str, str]] = []
    if gh:
        for r in db.scalars(select(Repo).where(Repo.provider_id == gh.id).order_by(Repo.name)).all():
            repos.append({"full_name": r.name, "default_branch": r.default_branch or "main"})
    return {
        "connected": bool(gh),
        "github_connected": gh is not None,
        "gitlab_connected": gl is not None,
        "providers": providers,
        "repos": repos,
    }


# Declarative-safe checks only — SG ingress is imperative (Console/CLI/SSM Automation).
_TERRAFORM_SNIPPET_CHECKS = frozenset(
    {
        "s3.bucket.public_access_not_blocked",
        "s3.bucket.no_https_policy",
        "kms.key.no_rotation",
        "kms.key.policy_wildcard_principal",
    }
)


def _generic(finding: Finding, ev: dict) -> dict[str, Any]:
    return {
        "iac_status": IAC_NOT_AVAILABLE,
        "reason": "No IaC template for this check yet — use Console/CLI instead.",
        "terraform": None,
        "cloudformation": None,
        "cli": [],
    }


def _s3_public_access(finding: Finding, ev: dict) -> dict[str, Any]:
    bucket = ev.get("bucket_name") or _name_from_arn(finding.resource_arn)
    logical = _logical_name(bucket)
    tf = f'''resource "aws_s3_bucket_public_access_block" "{logical}" {{
  bucket = aws_s3_bucket.{logical}.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}}'''
    return {
        "iac_status": IAC_SNIPPETS,
        "terraform": tf,
        "cloudformation": None,
        "cli": [
            f"aws s3api put-public-access-block --bucket {bucket} "
            "--public-access-block-configuration "
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
        ],
        "hints": [
            f'Match bucket "{bucket}" to your `aws_s3_bucket` resource; reuse an existing `aws_s3_bucket_public_access_block` if present.',
        ],
    }


def _s3_https(finding: Finding, ev: dict) -> dict[str, Any]:
    bucket = ev.get("bucket_name") or _name_from_arn(finding.resource_arn)
    logical = _logical_name(bucket)
    tf = f'''resource "aws_s3_bucket_policy" "{logical}_https_only" {{
  bucket = aws_s3_bucket.{logical}.id
  policy = jsonencode({{
    Version = "2012-10-17"
    Statement = [{{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [
        aws_s3_bucket.{logical}.arn,
        "${{aws_s3_bucket.{logical}.arn}}/*",
      ]
      Condition = {{
        Bool = {{ "aws:SecureTransport" = "false" }}
      }}
    }}]
  }})
}}'''
    return {
        "iac_status": IAC_SNIPPETS,
        "terraform": tf,
        "cloudformation": None,
        "cli": [],
        "hints": ["Merge with any existing bucket policy statements; do not replace unrelated allows."],
    }


def _kms_rotation(finding: Finding, ev: dict) -> dict[str, Any]:
    key_id = ev.get("key_id") or finding.resource_arn.split("/")[-1]
    logical = _logical_name(ev.get("alias") or key_id)
    tf = f'''resource "aws_kms_key" "{logical}" {{
  # existing key — enable rotation in place
  enable_key_rotation = true
}}'''
    return {
        "iac_status": IAC_SNIPPETS,
        "terraform": tf,
        "cloudformation": None,
        "cli": [f"aws kms enable-key-rotation --key-id {key_id}"],
        "hints": ["For imported keys, use `aws_kms_key` data source + `aws_kms_key` managed resource carefully to avoid replacement."],
    }


def _kms_wildcard(finding: Finding, ev: dict) -> dict[str, Any]:
    key_id = ev.get("key_id") or finding.resource_arn.split("/")[-1]
    return {
        "iac_status": IAC_SNIPPETS,
        "terraform": None,
        "cloudformation": None,
        "cli": [
            f"aws kms get-key-policy --key-id {key_id} --policy-name default --output text > policy.json",
            "# Edit policy.json: remove Principal \"*\" / \"AWS\": \"*\" — scope to specific roles/accounts",
            f"aws kms put-key-policy --key-id {key_id} --policy-name default --policy file://policy.json",
        ],
        "hints": ["Key policies are not fully modeled in Terraform for all layouts — review JSON manually."],
    }


def _sg_imperative_only(finding: Finding, ev: dict, *, port_label: str) -> dict[str, Any]:
    return {
        "iac_status": IAC_AUTOMATION_ONLY,
        "terraform": None,
        "cloudformation": None,
        "cli": [],
        "reason": (
            f"Revoking live security group ingress is imperative, not declarative Terraform. "
            f"Use Console or CLI above, or SSM Automation for port {port_label}."
        ),
        "hints": [
            "Terraform PRs will require a matching rule in your connected repo (not generic snippets).",
            "Use SSM Session Manager instead of open access from the internet where possible.",
        ],
    }


def _sg_rdp(finding: Finding, ev: dict) -> dict[str, Any]:
    return _sg_imperative_only(finding, ev, port_label="3389")


def _sg_ssh(finding: Finding, ev: dict) -> dict[str, Any]:
    return _sg_imperative_only(finding, ev, port_label="22")


_BUILDERS = {
    "s3.bucket.public_access_not_blocked": _s3_public_access,
    "s3.bucket.no_https_policy": _s3_https,
    "kms.key.no_rotation": _kms_rotation,
    "kms.key.policy_wildcard_principal": _kms_wildcard,
    "ec2.security_group.unrestricted_ssh": _sg_ssh,
    "ec2.security_group.unrestricted_rdp": _sg_rdp,
}


def _name_from_arn(arn: str | None) -> str:
    if not arn:
        return "resource"
    if arn.startswith("arn:aws:s3:::"):
        return arn.split(":::")[-1].split("/")[0]
    return arn.rsplit("/", 1)[-1]


def _logical_name(raw: str) -> str:
    out = "".join(c if c.isalnum() else "_" for c in raw)
    if out and out[0].isdigit():
        out = f"r_{out}"
    return out or "resource"
