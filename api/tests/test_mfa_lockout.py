from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core import mfa_lockout as lockout


@pytest.fixture(autouse=True)
def _reset_redis_client():
    lockout._client = None
    yield
    lockout._client = None


def test_record_failure_locks_after_five_attempts_tier_one():
    r = MagicMock()
    r.incr.return_value = 5
    r.get.return_value = "0"

    with patch.object(lockout, "_redis", return_value=r):
        with pytest.raises(HTTPException) as exc:
            lockout.record_mfa_failure("user-1")

    assert exc.value.status_code == 429
    assert "10" in exc.value.detail
    r.setex.assert_called_once_with("mfa:lock:user-1", 600, "1")
    r.set.assert_called_once_with("mfa:tier:user-1", 1)


def test_record_failure_second_lockout_is_thirty_minutes():
    r = MagicMock()
    r.incr.return_value = 5
    r.get.return_value = "1"

    with patch.object(lockout, "_redis", return_value=r):
        with pytest.raises(HTTPException) as exc:
            lockout.record_mfa_failure("user-1")

    assert exc.value.status_code == 429
    assert "30" in exc.value.detail
    r.setex.assert_called_once_with("mfa:lock:user-1", 1800, "1")


def test_check_mfa_lock_blocks_while_active():
    r = MagicMock()
    r.ttl.return_value = 120

    with patch.object(lockout, "_redis", return_value=r):
        with pytest.raises(HTTPException) as exc:
            lockout.check_mfa_lock("user-1")

    assert exc.value.status_code == 429


def test_clear_mfa_lockout_deletes_keys():
    r = MagicMock()
    with patch.object(lockout, "_redis", return_value=r):
        lockout.clear_mfa_lockout("user-1")
    r.delete.assert_called_once_with("mfa:fail:user-1", "mfa:lock:user-1", "mfa:tier:user-1")
