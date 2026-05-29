"""Match CloudTrail activity log events to open findings by resource identity."""
from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Finding

_ARN_RE = re.compile(r"arn:aws:[a-z0-9-]+:[a-z0-9-]*:([0-9]{12})?:([^/]+)/(.+)", re.I)


def _tokens_from_event(evt: dict[str, Any]) -> set[str]:
    tokens: set[str] = set()
    for res in evt.get("resources") or []:
        name = (res.get("name") or "").strip()
        rtype = (res.get("type") or "").strip()
        if name:
            tokens.add(name.lower())
        if rtype and name:
            tokens.add(f"{rtype}/{name}".lower())
    return tokens


def _tokens_from_finding(f: Finding) -> set[str]:
    tokens: set[str] = set()
    arn = (f.resource_arn or "").lower()
    if arn:
        tokens.add(arn)
        m = _ARN_RE.search(arn)
        if m:
            tokens.add(m.group(3).lower())
    ev = f.evidence or {}
    for key in (
        "user_name",
        "role_name",
        "bucket_name",
        "group_id",
        "group_name",
        "key_id",
        "trail_name",
        "instance_id",
    ):
        v = ev.get(key)
        if isinstance(v, str) and v.strip():
            tokens.add(v.strip().lower())
    return tokens


def link_findings_to_timeline_events(
    db: Session,
    account_id: uuid.UUID,
    events: list[dict[str, Any]],
    *,
    max_links_per_event: int = 3,
) -> list[dict[str, Any]]:
    """Attach related_findings[] to each timeline event when resource tokens overlap."""
    findings = db.scalars(
        select(Finding).where(
            Finding.account_id == account_id,
            Finding.status.in_(("open", "snoozed", "excepted")),
        )
    ).all()
    if not findings:
        return events

    finding_tokens: list[tuple[Finding, set[str]]] = [(f, _tokens_from_finding(f)) for f in findings]

    out: list[dict[str, Any]] = []
    for evt in events:
        evt_tokens = _tokens_from_event(evt)
        related: list[dict[str, str]] = []
        for f, ftoks in finding_tokens:
            if not evt_tokens or not ftoks:
                continue
            if evt_tokens & ftoks:
                related.append(
                    {
                        "finding_id": str(f.id),
                        "check_id": f.check_id,
                        "title": f.title,
                        "severity": f.severity,
                    }
                )
            if len(related) >= max_links_per_event:
                break
        row = {**evt, "related_findings": related}
        out.append(row)
    return out
