"""Unit tests for CIS account / server-cert / CloudShell checks."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.checks import (
    aws_account_contact_incomplete,
    aws_account_security_contact_missing,
    iam_cloudshell_access,
    iam_server_certificate_expired,
)
from app.models.resources import AccountGovernance, IamServerCertificate


def _db_with_governance(**kwargs):
    row = AccountGovernance(
        id=uuid.uuid4(),
        account_id=kwargs.get("account_id", uuid.uuid4()),
        primary_contact_complete=kwargs.get("primary_contact_complete", False),
        security_contact_complete=kwargs.get("security_contact_complete", False),
        collection_error=kwargs.get("collection_error"),
        contact_snapshot=kwargs.get("contact_snapshot"),
    )
    db = MagicMock()
    acc = MagicMock()
    acc.account_id = "123456789012"
    db.get.return_value = acc
    db.scalar.return_value = row
    return db, row.account_id


def test_contact_incomplete_finding_when_primary_incomplete():
    db, account_id = _db_with_governance(primary_contact_complete=False)
    findings = aws_account_contact_incomplete.run(db, account_id)
    assert len(findings) == 1
    assert findings[0].check_id == "aws.account.contact_incomplete"


def test_contact_incomplete_skips_on_collection_error():
    db, account_id = _db_with_governance(collection_error="AccessDenied")
    assert aws_account_contact_incomplete.run(db, account_id) == []


def test_security_contact_missing_finding():
    db, account_id = _db_with_governance(security_contact_complete=False)
    findings = aws_account_security_contact_missing.run(db, account_id)
    assert len(findings) == 1


def test_cloudshell_finding_on_user():
    db = MagicMock()
    user = MagicMock()
    user.arn = "arn:aws:iam::123:user/alice"
    user.name = "alice"
    user.attached_policies = [{"policy_name": "AWSCloudShellFullAccess"}]
    db.scalars.return_value.all.side_effect = [[user], []]
    findings = iam_cloudshell_access.run(db, uuid.uuid4())
    assert len(findings) == 1
    assert findings[0].check_id == "iam.cloudshell_full_access_granted"


def test_expired_server_certificate_finding():
    db = MagicMock()
    cert = IamServerCertificate(
        id=uuid.uuid4(),
        account_id=uuid.uuid4(),
        name="old-cert",
        arn="arn:aws:iam::123:server-certificate/old-cert",
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db.scalars.return_value.all.return_value = [cert]
    findings = iam_server_certificate_expired.run(db, cert.account_id)
    assert len(findings) == 1
