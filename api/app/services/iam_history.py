"""Point-in-time IAM roster from evidence snapshots (Type II sampling)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EvidenceSnapshot

IAM_ENTITY_TYPES = (
    "account_summary",
    "iam_user",
    "iam_access_key",
    "iam_role",
    "iam_password_policy",
    "identity_center_user",
)


def build_iam_history(
    db: Session,
    account_id: uuid.UUID,
    as_of: datetime,
    *,
    limit_per_type: int = 500,
) -> dict[str, Any]:
    """Latest snapshot per entity at or before as_of (nearest prior scan state)."""
    rows = db.scalars(
        select(EvidenceSnapshot)
        .where(
            EvidenceSnapshot.account_id == account_id,
            EvidenceSnapshot.entity_type.in_(IAM_ENTITY_TYPES),
            EvidenceSnapshot.taken_at <= as_of,
        )
        .order_by(EvidenceSnapshot.taken_at.desc())
    ).all()

    latest: dict[tuple[str, str], EvidenceSnapshot] = {}
    for row in rows:
        key = (row.entity_type, row.entity_id)
        if key not in latest:
            latest[key] = row

    by_type: dict[str, list[dict[str, Any]]] = {t: [] for t in IAM_ENTITY_TYPES}
    snapshot_times: list[datetime] = []
    for snap in latest.values():
        if len(by_type[snap.entity_type]) >= limit_per_type:
            continue
        snapshot_times.append(snap.taken_at)
        by_type[snap.entity_type].append(
            {
                "entity_id": snap.entity_id,
                "taken_at": snap.taken_at.isoformat(),
                "scan_run_id": str(snap.scan_run_id),
                "data": snap.payload_json or {},
            }
        )

    for items in by_type.values():
        items.sort(key=lambda x: x["entity_id"])

    return {
        "as_of": as_of.isoformat(),
        "source": "evidence_snapshots",
        "note": (
            "Each entry is the newest snapshot collected on or before as_of. "
            "If no scan ran before this date, the roster may be empty for that entity type."
        ),
        "snapshot_count": len(latest),
        "oldest_snapshot_in_set": min(snapshot_times).isoformat() if snapshot_times else None,
        "newest_snapshot_in_set": max(snapshot_times).isoformat() if snapshot_times else None,
        "entities": by_type,
        "summary": {t: len(by_type[t]) for t in IAM_ENTITY_TYPES},
    }
