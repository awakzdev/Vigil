import base64
import os

import pytest

from app.services.pack_signing import build_pack_signature, verify_pack_signature


@pytest.fixture
def signing_key(monkeypatch):
    seed = os.urandom(32)
    monkeypatch.setenv(
        "EVIDENCE_PACK_SIGNING_KEY",
        base64.urlsafe_b64encode(seed).decode().rstrip("="),
    )
    from app.core.config import get_settings
    from app.services import pack_signing

    get_settings.cache_clear()
    pack_signing._private_key.cache_clear()
    yield
    get_settings.cache_clear()
    pack_signing._private_key.cache_clear()


def test_sign_and_verify_manifest(signing_key):
    body = '{"algorithm":"sha256","artifacts":{"a.txt":"abc"}}'
    doc = build_pack_signature(body)
    assert doc is not None
    assert doc["algorithm"] == "ed25519"
    assert verify_pack_signature(body, doc)


def test_verify_fails_on_tamper(signing_key):
    body = '{"artifacts":{}}'
    doc = build_pack_signature(body)
    assert doc is not None
    assert not verify_pack_signature(body + " ", doc)


def test_no_key_returns_none(monkeypatch):
    monkeypatch.delenv("EVIDENCE_PACK_SIGNING_KEY", raising=False)
    from app.core.config import get_settings
    from app.services import pack_signing

    get_settings.cache_clear()
    pack_signing._private_key.cache_clear()
    assert build_pack_signature("{}") is None
