"""IaC remediation preview (Phase 2 — paste Terraform, get deterministic patch)."""
from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter

from app.services.hcl_patch import hcl_patch_preview

router = APIRouter()


class TfFileIn(BaseModel):
    path: str = "main.tf"
    content: str


class TerraformPreviewIn(BaseModel):
    check_id: str
    bucket_name: str | None = None
    files: list[TfFileIn] = Field(default_factory=list, max_length=20)


@router.post("/terraform/preview-patch")
def terraform_preview_patch(body: TerraformPreviewIn):
    """Match a finding to Terraform resources in pasted file(s). No Git clone yet."""
    files = [{"path": f.path, "content": f.content} for f in body.files]
    return hcl_patch_preview(
        check_id=body.check_id,
        bucket_name=body.bucket_name,
        files=files,
    )
