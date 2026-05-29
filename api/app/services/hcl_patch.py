"""Invoke Go hclpatch binary for repo-aware Terraform matching."""
from __future__ import annotations

import json
import subprocess
from typing import Any

from app.core.config import get_settings


def _run_hclpatch(cmd: str, payload: dict[str, Any]) -> dict[str, Any]:
    bin_path = get_settings().HCLPATCH_BIN
    try:
        proc = subprocess.run(
            [bin_path, cmd],
            input=json.dumps(payload).encode(),
            capture_output=True,
            timeout=60,
            check=False,
        )
    except FileNotFoundError:
        return {"status": "error", "message": "hclpatch binary not installed"}
    if proc.returncode != 0:
        err = proc.stderr.decode() or proc.stdout.decode() or "hclpatch failed"
        return {"status": "error", "message": err.strip()}
    return json.loads(proc.stdout.decode())


def hcl_repo_scan(
    *,
    check_id: str,
    files: list[dict[str, str]],
    bucket_name: str | None = None,
    key_id: str | None = None,
    group_id: str | None = None,
    group_name: str | None = None,
) -> dict[str, Any]:
    return _run_hclpatch(
        "scan",
        {
            "check_id": check_id,
            "bucket_name": bucket_name,
            "key_id": key_id,
            "group_id": group_id,
            "group_name": group_name,
            "files": files,
        },
    )


def hcl_patch_preview(
    *,
    check_id: str,
    files: list[dict[str, str]],
    bucket_name: str | None = None,
    key_id: str | None = None,
    group_id: str | None = None,
    group_name: str | None = None,
) -> dict[str, Any]:
    req = {
        "check_id": check_id,
        "bucket_name": bucket_name,
        "key_id": key_id,
        "group_id": group_id,
        "group_name": group_name,
        "files": files,
    }
    out = _run_hclpatch("patch", req)
    if out.get("status") == "error" and "not installed" in (out.get("message") or ""):
        from app.services.terraform_iac import preview_terraform_patch

        return preview_terraform_patch(
            check_id=check_id,
            bucket_name=bucket_name,
            files=files,
        )
    return out
