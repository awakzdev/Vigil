"""Compare evidence snapshots at two points in time."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EvidenceSnapshot


def _snapshot_at(
    db: Session,
    account_id: uuid.UUID,
    entity_type: str,
    entity_id: str,
    target: datetime,
) -> EvidenceSnapshot | None:
    before = db.scalars(
        select(EvidenceSnapshot)
        .where(
            EvidenceSnapshot.account_id == account_id,
            EvidenceSnapshot.entity_type == entity_type,
            EvidenceSnapshot.entity_id == entity_id,
            EvidenceSnapshot.taken_at <= target,
        )
        .order_by(EvidenceSnapshot.taken_at.desc())
        .limit(1)
    ).first()
    if before:
        return before
    return db.scalars(
        select(EvidenceSnapshot)
        .where(
            EvidenceSnapshot.account_id == account_id,
            EvidenceSnapshot.entity_type == entity_type,
            EvidenceSnapshot.entity_id == entity_id,
            EvidenceSnapshot.taken_at >= target,
        )
        .order_by(EvidenceSnapshot.taken_at.asc())
        .limit(1)
    ).first()


def _flatten(obj: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, (dict, list)):
                out.update(_flatten(v, key))
            else:
                out[key] = v
    elif isinstance(obj, list):
        out[prefix or "[]"] = obj
    else:
        out[prefix or "value"] = obj
    return out


def _diff_payloads(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    flat_before = _flatten(before)
    flat_after = _flatten(after)
    keys = sorted(set(flat_before) | set(flat_after))
    changes: list[dict[str, Any]] = []
    for key in keys:
        bv = flat_before.get(key)
        av = flat_after.get(key)
        if bv != av:
            changes.append({
                "field": key,
                "before": bv,
                "after": av,
            })
    return changes


def build_evidence_diff(
    db: Session,
    account_id: uuid.UUID,
    entity_type: str,
    entity_id: str,
    at_a: datetime | None = None,
    at_b: datetime | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    target_a = at_a or (now - timedelta(days=90))
    target_b = at_b or now

    snap_a = _snapshot_at(db, account_id, entity_type, entity_id, target_a)
    snap_b = _snapshot_at(db, account_id, entity_type, entity_id, target_b)

    if not snap_a and not snap_b:
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "at_a": target_a.isoformat(),
            "at_b": target_b.isoformat(),
            "found": False,
            "message": "No snapshots found for this entity in the selected window.",
            "changes": [],
        }

    payload_a = snap_a.payload_json if snap_a else {}
    payload_b = snap_b.payload_json if snap_b else {}
    changes = _diff_payloads(payload_a, payload_b)

    exposure_note = None
    if changes:
        exposure_note = (
            f"{len(changes)} field(s) changed between "
            f"{(snap_a.taken_at if snap_a else target_a).date()} and "
            f"{(snap_b.taken_at if snap_b else target_b).date()}."
        )

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "at_a": target_a.isoformat(),
        "at_b": target_b.isoformat(),
        "snapshot_a": {
            "id": str(snap_a.id) if snap_a else None,
            "taken_at": snap_a.taken_at.isoformat() if snap_a else None,
            "data": payload_a,
        },
        "snapshot_b": {
            "id": str(snap_b.id) if snap_b else None,
            "taken_at": snap_b.taken_at.isoformat() if snap_b else None,
            "data": payload_b,
        },
        "found": True,
        "change_count": len(changes),
        "exposure_note": exposure_note,
        "changes": changes[:100],
    }
