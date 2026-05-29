"""Deterministic IaC / CLI snippets per finding (Phase 1 — no repo PR)."""
from __future__ import annotations

from typing import Any

from app.models import Finding

IAC_NOT_AVAILABLE = "iac_not_available"
IAC_SNIPPETS = "iac_snippets"


def build_iac_remediation(finding: Finding) -> dict[str, Any]:
    """Return terraform, cloudformation, and cli snippets for a finding."""
    cid = finding.check_id
    ev = finding.evidence or {}
    builder = _BUILDERS.get(cid, _generic)
    body = builder(finding, ev)
    body["check_id"] = cid
    body["finding_id"] = str(finding.id)
    body["resource_arn"] = finding.resource_arn
    body["phase"] = "snippets"
    body["pr_automation"] = {
        "available": body.get("iac_status") == IAC_SNIPPETS and cid in _TERRAFORM_RULE_CHECKS,
        "note": (
            "Repo PRs require matching this resource in your Terraform (parser preview below). "
            "Human review required before merge."
        ),
    }
    return body


_TERRAFORM_RULE_CHECKS = frozenset(
    {
        "s3.bucket.public_access_not_blocked",
        "s3.bucket.no_https_policy",
        "kms.key.no_rotation",
        "kms.key.policy_wildcard_principal",
        "ec2.security_group.unrestricted_ssh",
    }
)


def _generic(finding: Finding, ev: dict) -> dict[str, Any]:
    return {
        "iac_status": IAC_NOT_AVAILABLE,
        "reason": "No deterministic IaC template for this check yet — use Console/CLI steps in the drawer.",
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


def _sg_ssh(finding: Finding, ev: dict) -> dict[str, Any]:
    sg_id = ev.get("group_id") or ev.get("security_group_id") or _name_from_arn(finding.resource_arn)
    logical = _logical_name(sg_id)
    tf = f'''# In resource "aws_security_group" "{logical}" — remove or narrow:
#   cidr_blocks = ["0.0.0.0/0"] on port 22
# Prefer SSM Session Manager instead of open SSH.'''
    return {
        "iac_status": IAC_SNIPPETS,
        "terraform": tf,
        "cloudformation": None,
        "cli": [
            f"# Revoke open SSH: aws ec2 revoke-security-group-ingress --group-id {sg_id} "
            "--protocol tcp --port 22 --cidr 0.0.0.0/0",
        ],
        "hints": ["Parser can locate `aws_security_group` / `aws_vpc_security_group_ingress_rule` blocks with 0.0.0.0/0:22."],
    }


_BUILDERS = {
    "s3.bucket.public_access_not_blocked": _s3_public_access,
    "s3.bucket.no_https_policy": _s3_https,
    "kms.key.no_rotation": _kms_rotation,
    "kms.key.policy_wildcard_principal": _kms_wildcard,
    "ec2.security_group.unrestricted_ssh": _sg_ssh,
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
