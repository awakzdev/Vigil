from app.services.iac_snippets import build_iac_remediation
from app.services.terraform_iac import preview_terraform_patch
from app.models import Finding
import uuid
from datetime import datetime, timezone


def _finding(**kwargs) -> Finding:
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        account_id=uuid.uuid4(),
        check_id="s3.bucket.public_access_not_blocked",
        resource_arn="arn:aws:s3:::app-logs-prod",
        title="test",
        severity="high",
        risk_score=80,
        status="open",
        evidence={"bucket_name": "app-logs-prod"},
        first_seen=now,
        last_seen=now,
    )
    base.update(kwargs)
    return Finding(**base)


def test_s3_public_access_snippet():
    out = build_iac_remediation(_finding())
    assert out["iac_status"] == "iac_snippets"
    assert "aws_s3_bucket_public_access_block" in out["terraform"]
    assert "app-logs-prod" in out["cli"][0]


def test_terraform_preview_create_pab():
    tf = '''
resource "aws_s3_bucket" "logs" {
  bucket = "app-logs-prod"
}
'''
    out = preview_terraform_patch(
        check_id="s3.bucket.public_access_not_blocked",
        bucket_name="app-logs-prod",
        files=[{"path": "s3.tf", "content": tf}],
    )
    assert out["status"] == "create_new"
    assert "aws_s3_bucket_public_access_block" in out["suggested_hcl"]


def test_terraform_preview_modify_existing_pab():
    tf = '''
resource "aws_s3_bucket" "logs" {
  bucket = "app-logs-prod"
}
resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id
  block_public_acls = false
}
'''
    out = preview_terraform_patch(
        check_id="s3.bucket.public_access_not_blocked",
        bucket_name="app-logs-prod",
        files=[{"path": "s3.tf", "content": tf}],
    )
    assert out["status"] == "modify_existing"
    assert out["public_access_block"]["name"] == "logs"


def test_kms_wildcard_check_import():
    from app.checks.kms_key_policy_wildcard import CHECK_ID

    assert CHECK_ID == "kms.key.policy_wildcard_principal"
