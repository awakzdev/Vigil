"""Build-time metadata for evidence packs (versions, check registry, environment)."""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.checks.registry import ALL_CHECKS
from app.core.config import get_settings
from app.services.check_frameworks import check_framework_map

_MAPPINGS_PATH = Path(__file__).parent.parent.parent / "data" / "control_mappings.json"


@lru_cache(maxsize=1)
def _mappings_sha256() -> str:
    return hashlib.sha256(_MAPPINGS_PATH.read_bytes()).hexdigest()[:16]


def _git_sha() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        if out.returncode == 0:
            return out.stdout.strip()[:12]
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def build_pack_provenance(*, generated_at: datetime | None = None) -> dict[str, Any]:
    s = get_settings()
    ts = generated_at or datetime.now(timezone.utc)
    return {
        "pack_version": "2.3",
        "generated_at_utc": ts.isoformat(),
        "app_env": s.APP_ENV,
        "time_source": "UTC server clock",
        "check_registry": {
            "automated_check_count": len(ALL_CHECKS),
            "check_ids_hash": hashlib.sha256(
                "|".join(sorted(m.CHECK_ID for m in ALL_CHECKS)).encode()
            ).hexdigest()[:16],
        },
        "control_mappings_hash": _mappings_sha256(),
        "framework_map_check_count": len(check_framework_map()),
        "build": {
            "git_sha": _git_sha(),
            "python_platform": __import__("platform").platform(),
        },
    }
