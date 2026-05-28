"""Org-level check enable/disable (benchmark vs optional hygiene)."""
from __future__ import annotations

from app.checks.optional_checks import OPTIONAL_BY_ID, OPTIONAL_CHECKS


def is_check_enabled(org_settings: dict | None, check_id: str) -> bool:
    checks = (org_settings or {}).get("checks", {})
    stored = checks.get(check_id)
    if stored is not None and "enabled" in stored:
        return bool(stored["enabled"])
    meta = OPTIONAL_BY_ID.get(check_id)
    if meta is not None:
        return bool(meta["default_enabled"])
    return True


def hidden_check_ids(org_settings: dict | None) -> set[str]:
    return {
        meta["check_id"]
        for meta in OPTIONAL_CHECKS
        if not is_check_enabled(org_settings, meta["check_id"])
    }


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
