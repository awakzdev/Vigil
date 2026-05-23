"""Password hashing.

Uses bcrypt directly (passlib has bcrypt-4.x compat issues).

bcrypt rejects inputs > 72 bytes. We sha256-prehash the password to
bound length and preserve full entropy regardless of input size.
"""
from __future__ import annotations

import base64
import hashlib

import bcrypt


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
