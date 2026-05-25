"""Fernet-based transparent column encryption for SQLAlchemy."""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().ENCRYPTION_KEY
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


class EncryptedString(TypeDecorator):
    """Transparently encrypts on write, decrypts on read."""

    impl = String
    cache_ok = True

    def __init__(self, length: int = 700, *args, **kwargs):
        super().__init__(length, *args, **kwargs)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return decrypt(value)
        except (InvalidToken, Exception):
            return value
