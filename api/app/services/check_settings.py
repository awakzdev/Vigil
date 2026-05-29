"""Org-level check enable/disable (benchmark vs optional hygiene)."""
from __future__ import annotations

from app.checks.optional_checks import (
    OPTIONAL_BY_ID,
    OPTIONAL_CHECKS,
    OPTIONAL_LINKED,
    OPTIONAL_SETTINGS_ALIASES,
)


def _primary_optional_id(check_id: str) -> str:
    check_id = OPTIONAL_SETTINGS_ALIASES.get(check_id, check_id)
    for parent, linked in OPTIONAL_LINKED.items():
        if check_id == parent or check_id in linked:
            return parent
    return check_id


def _stored_enabled(checks: dict, primary_id: str) -> bool | None:
    stored = checks.get(primary_id)
    if stored is not None and "enabled" in stored:
        return bool(stored["enabled"])
    for legacy, canonical in OPTIONAL_SETTINGS_ALIASES.items():
        if canonical == primary_id:
            legacy_stored = checks.get(legacy)
            if legacy_stored is not None and "enabled" in legacy_stored:
                return bool(legacy_stored["enabled"])
    return None


def is_check_enabled(org_settings: dict | None, check_id: str) -> bool:
    primary = _primary_optional_id(check_id)
    checks = (org_settings or {}).get("checks", {})
    stored = _stored_enabled(checks, primary)
    if stored is not None:
        return stored
    meta = OPTIONAL_BY_ID.get(primary)
    if meta is not None:
        return bool(meta["default_enabled"])
    return True


def hidden_check_ids(org_settings: dict | None) -> set[str]:
    hidden: set[str] = set()
    for meta in OPTIONAL_CHECKS:
        check_id = meta["check_id"]
        if not is_check_enabled(org_settings, check_id):
            hidden.add(check_id)
            for linked in OPTIONAL_LINKED.get(check_id, []):
                hidden.add(linked)
    return hidden


def optional_checks_for_ui(org_settings: dict | None) -> list[dict]:
    out: list[dict] = []
    for meta in OPTIONAL_CHECKS:
        check_id = meta["check_id"]
        out.append(
            {
                "check_id": check_id,
                "label": meta["label"],
                "summary": meta["summary"],
                "description": meta["description"],
                "default_enabled": meta["default_enabled"],
                "enabled": is_check_enabled(org_settings, check_id),
            }
        )
    return out
