"""Unit tests for evidence pack assembly logic."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock


def _finding(*, check_id: str, status: str = "open"):
    f = MagicMock()
    f.id = uuid.uuid4()
    f.check_id = check_id
    f.resource_arn = "arn:aws:iam::123:role/x"
    f.title = "test"
    f.severity = "high"
    f.risk_score = 70
    f.status = status
    f.first_seen = f.last_seen = MagicMock()
    f.first_seen.isoformat = f.last_seen.isoformat = lambda: "2026-01-01T00:00:00+00:00"
    f.evidence = {}
    f.exception_reason = None
    f.exception_approved_by = None
    f.exception_expires_at = None
    return f


def test_control_status_passes_when_only_excepted_findings():
    from app.services.evidence_pack import _control_status

    findings = [_finding(check_id="iam.user.no_mfa", status="excepted")]
    status, hits = _control_status(findings, ["iam.user.no_mfa"])
    assert status == "pass"
    assert len(hits) == 1


def test_control_status_fails_when_open_findings_exist():
    from app.services.evidence_pack import _control_status

    findings = [_finding(check_id="iam.user.no_mfa", status="open")]
    status, _ = _control_status(findings, ["iam.user.no_mfa"])
    assert status == "fail"


def test_index_csv_includes_exception_count():
    from app.services.evidence_pack import _build_index_csv

    csv_text = _build_index_csv([
        {
            "control_id": "CC6.1",
            "title": "Access",
            "status": "pass",
            "finding_count": 0,
            "exception_count": 2,
        }
    ])
    lines = csv_text.strip().splitlines()
    assert lines[0] == "control_id,title,status,open_findings,exceptions"
    assert "CC6.1" in lines[1]
    assert lines[1].endswith(",2")


def test_s3_no_default_encryption_flags_unencrypted_buckets(mock_db):
    from app.checks import s3_no_default_encryption

    acc_id = uuid.uuid4()
    bucket = MagicMock()
    bucket.arn = "arn:aws:s3:::logs"
    bucket.name = "logs"
    bucket.encrypted = False
    mock_db.scalars.return_value.all.return_value = [bucket]
    drafts = s3_no_default_encryption.run(mock_db, acc_id)
    assert len(drafts) == 1
    assert drafts[0].check_id == "s3.bucket.no_default_encryption"
