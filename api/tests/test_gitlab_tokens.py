from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services import gitlab_tokens as tokens


def _config(*, expires_in: int | None = 3600, refresh_token: str | None = "rt-1") -> dict:
    cfg = {"access_token": "at-old", "refresh_token": refresh_token}
    if expires_in is not None:
        cfg["token_expires_at"] = (
            datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        ).isoformat()
    return cfg


def test_apply_oauth_tokens_stores_refresh_and_expiry():
    out = tokens.apply_oauth_tokens(
        {"access_token": "old"},
        {"access_token": "new", "refresh_token": "rt-2", "expires_in": 7200},
    )
    assert out["access_token"] == "new"
    assert out["refresh_token"] == "rt-2"
    assert out["token_expires_at"]


def test_ensure_gitlab_token_returns_current_when_not_expiring():
    provider = MagicMock()
    db = MagicMock()
    with patch("app.services.gitlab_tokens.provider_config", return_value=_config(expires_in=3600)):
        assert tokens.ensure_gitlab_token(db, provider) == "at-old"


def test_ensure_gitlab_token_refreshes_when_near_expiry():
    provider = MagicMock()
    db = MagicMock()
    cfg = _config(expires_in=30)
    with (
        patch("app.services.gitlab_tokens.provider_config", side_effect=[cfg, {**cfg, "access_token": "at-new"}]),
        patch("app.services.gitlab_tokens.refresh_gitlab_token", return_value="at-new") as refresh,
    ):
        assert tokens.ensure_gitlab_token(db, provider) == "at-new"
    refresh.assert_called_once_with(db, provider)


def test_refresh_gitlab_token_updates_provider():
    provider = MagicMock()
    db = MagicMock()
    cfg = _config(expires_in=3600)
    resp = httpx.Response(
        200,
        json={"access_token": "at-new", "refresh_token": "rt-new", "expires_in": 7200},
    )

    with (
        patch("app.services.gitlab_tokens.provider_config", side_effect=[cfg, {**cfg, "access_token": "at-new"}]),
        patch("app.services.gitlab_tokens.get_settings") as settings,
        patch("app.services.gitlab_tokens.set_provider_config") as save,
        patch("httpx.Client") as client_cls,
    ):
        settings.return_value.GITLAB_CLIENT_ID = "cid"
        settings.return_value.GITLAB_CLIENT_SECRET = "sec"
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = resp
        assert tokens.refresh_gitlab_token(db, provider) == "at-new"

    saved_cfg = save.call_args[0][1]
    assert saved_cfg["access_token"] == "at-new"
    assert saved_cfg["refresh_token"] == "rt-new"
    db.commit.assert_called_once()


def test_refresh_without_refresh_token_raises_reconnect():
    provider = MagicMock()
    db = MagicMock()
    cfg = _config(refresh_token=None, expires_in=-60)
    with (
        patch("app.services.gitlab_tokens.provider_config", return_value=cfg),
        pytest.raises(tokens.GitLabReconnectRequired),
    ):
        tokens.refresh_gitlab_token(db, provider)
