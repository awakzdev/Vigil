"""Password hashing.

Uses bcrypt directly (passlib has bcrypt-4.x compat issues).

bcrypt rejects inputs > 72 bytes. We sha256-prehash the password to
bound length and preserve full entropy regardless of input size.
"""
from __future__ import annotations

import base64
import hashlib

import bcrypt


def pwned_count(password: str) -> int:
    """Return the number of times this password appears in HIBP breaches (k-anonymity).

    Returns 0 if not found or if the API call fails — we never block signup on a network error.
    """
    import httpx

    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        resp = httpx.get(
            f"https://api.pwnedpasswords.com/range/{prefix}",
            headers={"Add-Padding": "true"},
            timeout=3,
        )
        if resp.status_code != 200:
            return 0
        for line in resp.text.splitlines():
            if ":" not in line:
                continue
            h, count = line.split(":", 1)
            if h == suffix:
                return int(count)
    except Exception:  # noqa: BLE001
        return 0
    return 0


def _prehash(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    # base64 keeps it printable bytes; 44 bytes < bcrypt 72-byte limit
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), hashed.encode("utf-8"))
    except ValueError:
        return False
