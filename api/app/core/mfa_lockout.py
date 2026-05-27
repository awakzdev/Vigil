"""Escalating MFA verify lockout backed by Redis."""
from __future__ import annotations

import redis
from fastapi import HTTPException, status

from app.core.config import get_settings

FAIL_LIMIT = 5
LOCK_SECONDS = (600, 1800)  # 10 min, then 30 min on repeat lockouts

_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _client


def _fail_key(user_id: str) -> str:
    return f"mfa:fail:{user_id}"


def _lock_key(user_id: str) -> str:
    return f"mfa:lock:{user_id}"


def _tier_key(user_id: str) -> str:
    return f"mfa:tier:{user_id}"


def _lock_message(ttl_seconds: int) -> str:
    minutes = max(1, (ttl_seconds + 59) // 60)
    unit = "minute" if minutes == 1 else "minutes"
    return f"Too many failed attempts. Try again in {minutes} {unit}."


def check_mfa_lock(user_id: str) -> None:
    ttl = _redis().ttl(_lock_key(user_id))
    if ttl and ttl > 0:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, _lock_message(ttl))


def record_mfa_failure(user_id: str) -> None:
    r = _redis()
    fails = r.incr(_fail_key(user_id))
    if fails == 1:
        r.expire(_fail_key(user_id), 3600)

    if fails < FAIL_LIMIT:
        return

    tier = int(r.get(_tier_key(user_id)) or 0)
    lock_secs = LOCK_SECONDS[min(tier, len(LOCK_SECONDS) - 1)]
    r.setex(_lock_key(user_id), lock_secs, "1")
    r.set(_tier_key(user_id), tier + 1)
    r.delete(_fail_key(user_id))
    raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, _lock_message(lock_secs))


def clear_mfa_lockout(user_id: str) -> None:
    r = _redis()
    r.delete(_fail_key(user_id), _lock_key(user_id), _tier_key(user_id))
