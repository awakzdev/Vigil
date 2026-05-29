"""Tests for compliance timeline and evidence diff."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock


def test_control_status_passes_with_no_open_findings():
    from app.services.compliance_timeline import _control_status_at

    now = datetime.now(timezone.utc)
    status = _control_status_at([], [], now, True, {})
    assert status == "no_data"

    f = MagicMock()
    f.check_id = "iam.user.no_mfa"
    f.status = "open"
    f.first_seen = now
    f.resolved_at = None
    status = _control_status_at(["iam.user.no_mfa"], [f], now, True, {})
    assert status == "fail"


def test_excepted_findings_do_not_fail_control():
    from app.services.compliance_timeline import _control_status_at

    now = datetime.now(timezone.utc)
    f = MagicMock()
    f.check_id = "iam.user.no_mfa"
    f.status = "excepted"
    f.first_seen = now
    f.resolved_at = None
    status = _control_status_at(["iam.user.no_mfa"], [f], now, True, {})
    assert status == "pass"


def test_evidence_diff_detects_changes():
    from app.services.evidence_diff import _diff_payloads

    changes = _diff_payloads({"mfa_enabled": True}, {"mfa_enabled": False})
    assert len(changes) == 1
    assert changes[0]["field"] == "mfa_enabled"
