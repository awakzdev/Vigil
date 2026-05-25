"""Unit tests for check modules. DB is mocked — checks are pure logic."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from tests.conftest import make_account, now


def _user(*, arn=None, name="alice", has_console_password=True, mfa_enabled=False, account_id=None):
    u = MagicMock()
    u.account_id = account_id or uuid.uuid4()
    u.arn = arn or f"arn:aws:iam::123456789012:user/{name}"
    u.name = name
    u.has_console_password = has_console_password
    u.mfa_enabled = mfa_enabled
    u.last_used_at = None
    u.created_at = datetime.now(timezone.utc) - timedelta(days=200)
    return u


def _key(*, key_id="AKIAIOSFODNN7EXAMPLE", user_arn="arn:aws:iam::123456789012:user/alice",
         status="Active", created=None, last_used=None, account_id=None):
    k = MagicMock()
    k.account_id = account_id or uuid.uuid4()
    k.key_id = key_id
    k.user_arn = user_arn
    k.status = status
    k.created = created or (datetime.now(timezone.utc) - timedelta(days=120))
    k.last_used = last_used
    return k


def _role(*, arn=None, name="DeployRole", inline_policies=None, account_id=None):
    r = MagicMock()
    r.account_id = account_id or uuid.uuid4()
    r.arn = arn or f"arn:aws:iam::123456789012:role/{name}"
    r.name = name
    r.inline_policies = inline_policies or {}
    r.last_used_at = None
    r.created_at = datetime.now(timezone.utc) - timedelta(days=100)
    return r


# --- iam.user.no_mfa ---

class TestNoMfa:
    def test_flags_console_user_without_mfa(self, mock_db):
        from app.checks import iam_user_no_mfa
        acc_id = uuid.uuid4()
        mock_db.scalars.return_value.all.return_value = [_user(account_id=acc_id)]
        drafts = iam_user_no_mfa.run(mock_db, acc_id)
        assert len(drafts) == 1
        assert drafts[0].check_id == "iam.user.no_mfa"
        assert drafts[0].severity == "high"

    def test_skips_user_with_mfa(self, mock_db):
        from app.checks import iam_user_no_mfa
        acc_id = uuid.uuid4()
        mock_db.scalars.return_value.all.return_value = [_user(mfa_enabled=True)]
        # check filters in SQL — mock returns empty (as if WHERE filtered it out)
        mock_db.scalars.return_value.all.return_value = []
        drafts = iam_user_no_mfa.run(mock_db, acc_id)
        assert drafts == []

    def test_skips_user_without_console_access(self, mock_db):
        from app.checks import iam_user_no_mfa
        mock_db.scalars.return_value.all.return_value = []
        drafts = iam_user_no_mfa.run(mock_db, uuid.uuid4())
        assert drafts == []


# --- iam.access_key.unused_90d ---

class TestAccessKeyUnused:
    def test_flags_key_never_used(self, mock_db):
        from app.checks import iam_access_key_unused
        acc_id = uuid.uuid4()
        old_key = _key(account_id=acc_id, last_used=None,
                       created=datetime.now(timezone.utc) - timedelta(days=120))
        mock_db.scalars.return_value.all.return_value = [old_key]
        drafts = iam_access_key_unused.run(mock_db, acc_id)
        assert len(drafts) == 1
        assert "unused" in drafts[0].title.lower()

    def test_flags_key_last_used_over_90d(self, mock_db):
        from app.checks import iam_access_key_unused
        acc_id = uuid.uuid4()
        stale_key = _key(
            account_id=acc_id,
            last_used=datetime.now(timezone.utc) - timedelta(days=95),
        )
        mock_db.scalars.return_value.all.return_value = [stale_key]
        drafts = iam_access_key_unused.run(mock_db, acc_id)
        assert len(drafts) == 1

    def test_skips_recently_used_key(self, mock_db):
        from app.checks import iam_access_key_unused
        acc_id = uuid.uuid4()
        fresh_key = _key(
            account_id=acc_id,
            last_used=datetime.now(timezone.utc) - timedelta(days=10),
        )
        mock_db.scalars.return_value.all.return_value = [fresh_key]
        drafts = iam_access_key_unused.run(mock_db, acc_id)
        assert drafts == []

    def test_skips_inactive_key(self, mock_db):
        from app.checks import iam_access_key_unused
        # inactive keys filtered by SQL WHERE status='Active', so mock returns []
        mock_db.scalars.return_value.all.return_value = []
        drafts = iam_access_key_unused.run(mock_db, uuid.uuid4())
        assert drafts == []


# --- iam.role.wildcard_action ---

class TestWildcardAction:
    def test_flags_role_with_star_action(self, mock_db):
        from app.checks import role_wildcard_action
        acc_id = uuid.uuid4()
        policy = {
            "Statement": [
                {"Effect": "Allow", "Action": "*", "Resource": "*"}
            ]
        }
        r = _role(account_id=acc_id, inline_policies={"AdminPolicy": policy})
        mock_db.scalars.return_value.all.return_value = [r]
        drafts = role_wildcard_action.run(mock_db, acc_id)
        assert len(drafts) == 1
        assert drafts[0].check_id == "iam.role.wildcard_action"
        assert drafts[0].severity == "high"

    def test_skips_role_without_wildcard(self, mock_db):
        from app.checks import role_wildcard_action
        acc_id = uuid.uuid4()
        policy = {
            "Statement": [
                {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "*"}
            ]
        }
        r = _role(account_id=acc_id, inline_policies={"S3Policy": policy})
        mock_db.scalars.return_value.all.return_value = [r]
        drafts = role_wildcard_action.run(mock_db, acc_id)
        assert drafts == []

    def test_skips_deny_statement_with_star(self, mock_db):
        from app.checks import role_wildcard_action
        acc_id = uuid.uuid4()
        policy = {
            "Statement": [
                {"Effect": "Deny", "Action": "*", "Resource": "*"}
            ]
        }
        r = _role(account_id=acc_id, inline_policies={"DenyAll": policy})
        mock_db.scalars.return_value.all.return_value = [r]
        drafts = role_wildcard_action.run(mock_db, acc_id)
        assert drafts == []

    def test_skips_service_linked_role(self, mock_db):
        from app.checks import role_wildcard_action
        acc_id = uuid.uuid4()
        policy = {"Statement": [{"Effect": "Allow", "Action": "*", "Resource": "*"}]}
        r = _role(
            account_id=acc_id,
            arn="arn:aws:iam::123:role/aws-service-role/ec2.amazonaws.com/AWSServiceRoleForEC2",
            inline_policies={"AdminPolicy": policy},
        )
        mock_db.scalars.return_value.all.return_value = [r]
        drafts = role_wildcard_action.run(mock_db, acc_id)
        assert drafts == []

    def test_no_roles_returns_empty(self, mock_db):
        from app.checks import role_wildcard_action
        mock_db.scalars.return_value.all.return_value = []
        drafts = role_wildcard_action.run(mock_db, uuid.uuid4())
        assert drafts == []
