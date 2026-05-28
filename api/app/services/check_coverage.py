"""Check coverage tier — core benchmark vs extended supporting evidence."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_TIERS_PATH = Path(__file__).parent.parent.parent / "data" / "check_coverage_tier.json"

TIER_CORE = "core"
TIER_EXTENDED = "extended"


@lru_cache(maxsize=1)
def check_coverage_tier_map() -> dict[str, str]:
    raw = json.loads(_TIERS_PATH.read_text())
    return {k: v for k, v in raw.items() if v in (TIER_CORE, TIER_EXTENDED)}


def tier_for_check(check_id: str) -> str:
    return check_coverage_tier_map().get(check_id, TIER_CORE)


def extended_checks_in_list(check_ids: list[str]) -> list[str]:
    return [cid for cid in check_ids if tier_for_check(cid) == TIER_EXTENDED]


def control_coverage_tier(check_ids: list[str]) -> str:
    if not check_ids:
        return "no_data"
    tiers = {tier_for_check(cid) for cid in check_ids}
    if tiers == {TIER_EXTENDED}:
        return TIER_EXTENDED
    if TIER_EXTENDED in tiers:
        return "mixed"
    return TIER_CORE


def tier_display_label(tier: str) -> str | None:
    if tier == TIER_EXTENDED:
        return "Supports control objective"
    if tier == "mixed":
        return "Core + extended coverage"
    return None
