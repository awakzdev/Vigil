"""Lightweight Terraform HCL matcher for PR-preview (deterministic, no LLM)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

RESOURCE_HEAD = re.compile(r'resource\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)
ATTR_STRING = re.compile(r'^\s*([a-zA-Z0-9_.]+)\s*=\s*"([^"]*)"', re.MULTILINE)


@dataclass
class TfResource:
    type: str
    name: str
    file_path: str
    start: int
    body: str


def parse_terraform_files(files: list[dict[str, str]]) -> list[TfResource]:
    """Parse .tf file contents into resource blocks (regex — not a full HCL parser)."""
    resources: list[TfResource] = []
    for f in files:
        path = f.get("path") or "main.tf"
        content = f.get("content") or ""
        for m in RESOURCE_HEAD.finditer(content):
            start = m.start()
            rtype, rname = m.group(1), m.group(2)
            body = _extract_brace_block(content, m.end() - 1)
            resources.append(
                TfResource(type=rtype, name=rname, file_path=path, start=start, body=body),
            )
    return resources


def _extract_brace_block(text: str, open_idx: int) -> str:
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[open_idx : i + 1]
    return text[open_idx:]


def _attrs(body: str) -> dict[str, str]:
    return {m.group(1): m.group(2) for m in ATTR_STRING.finditer(body)}


def preview_terraform_patch(
    *,
    check_id: str,
    bucket_name: str | None = None,
    files: list[dict[str, str]],
) -> dict[str, Any]:
    """Suggest create vs update for supported checks given customer Terraform files."""
    resources = parse_terraform_files(files)
    if check_id == "s3.bucket.public_access_not_blocked":
        return _preview_s3_public_access(resources, bucket_name)
    return {
        "status": "unsupported",
        "check_id": check_id,
        "message": "Terraform repo preview not implemented for this check yet.",
    }


def _preview_s3_public_access(resources: list[TfResource], bucket_name: str | None) -> dict[str, Any]:
    if not bucket_name:
        return {"status": "error", "message": "bucket_name required"}

    bucket_res: TfResource | None = None
    for r in resources:
        if r.type != "aws_s3_bucket":
            continue
        attrs = _attrs(r.body)
        if attrs.get("bucket") == bucket_name or r.name == bucket_name:
            bucket_res = r
            break

    if not bucket_res:
        return {
            "status": "not_found",
            "message": f'No aws_s3_bucket with bucket = "{bucket_name}" found in supplied files.',
        }

    pab: TfResource | None = None
    bucket_ref = f"aws_s3_bucket.{bucket_res.name}"
    for r in resources:
        if r.type != "aws_s3_bucket_public_access_block":
            continue
        attrs = _attrs(r.body)
        ref = attrs.get("bucket", "")
        if (
            bucket_res.name in ref
            or bucket_name in ref
            or bucket_ref in r.body
            or r.name == bucket_res.name
        ):
            pab = r
            break

    patch_tf = f'''resource "aws_s3_bucket_public_access_block" "{bucket_res.name}" {{
  bucket = aws_s3_bucket.{bucket_res.name}.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}}'''

    if pab:
        return {
            "status": "modify_existing",
            "bucket_resource": {"type": bucket_res.type, "name": bucket_res.name, "file": bucket_res.file_path},
            "public_access_block": {"name": pab.name, "file": pab.file_path},
            "action": "Update the existing aws_s3_bucket_public_access_block to set all four block_* flags true.",
            "suggested_hcl": patch_tf,
        }

    return {
        "status": "create_new",
        "bucket_resource": {"type": bucket_res.type, "name": bucket_res.name, "file": bucket_res.file_path},
        "action": f'Append new block to {bucket_res.file_path} (or a dedicated .tf file).',
        "suggested_hcl": patch_tf,
    }
