"""Control pass/fail history derived from findings and scan runs."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Finding, FindingEvent, ScanRun
from app.models.control import Control, CheckControl
from app.services.finding_history import (
    finding_open_for_control,
    finding_state_at,
    load_events_by_finding,
)


def _control_status_at(
    check_ids: list[str],
    findings: list[Finding],
    t: datetime,
    has_scan_before: bool,
    events_by_finding: dict,
) -> str:
    if not check_ids:
        return "no_data"
    if not has_scan_before:
        return "no_data"
    for f in findings:
        if f.check_id not in check_ids:
            continue
        state = finding_state_at(f, t, events_by_finding.get(f.id))
        if finding_open_for_control(f, state):
            return "fail"
    return "pass"


def build_control_history(
    db: Session,
    account_id: uuid.UUID,
    framework: str,
    control_id: str,
    days: int = 90,
) -> dict[str, Any]:
    ctrl = db.scalars(
        select(Control).where(Control.framework == framework, Control.control_id == control_id)
    ).first()
    if not ctrl:
        raise ValueError("control not found")

    check_ids = list(
        db.scalars(select(CheckControl.check_id).where(CheckControl.control_id == ctrl.id)).all()
    )
    since = datetime.now(timezone.utc) - timedelta(days=days)
    now = datetime.now(timezone.utc)

    findings = db.scalars(
        select(Finding).where(Finding.account_id == account_id)
    ).all()
    mapped_findings = [f for f in findings if f.check_id in check_ids]
    events_by_finding = load_events_by_finding(db, [f.id for f in mapped_findings])

    scan_runs = db.scalars(
        select(ScanRun)
        .where(ScanRun.account_id == account_id, ScanRun.started_at >= since)
        .order_by(ScanRun.started_at.asc())
    ).all()

    # Boundary timestamps for segment computation
    boundaries: set[datetime] = {since, now}
    for run in scan_runs:
        ts = run.finished_at or run.started_at
        boundaries.add(ts)
    for f in mapped_findings:
        if f.first_seen >= since:
            boundaries.add(f.first_seen)
        if f.resolved_at and f.resolved_at >= since:
            boundaries.add(f.resolved_at)

    sorted_bounds = sorted(boundaries)
    segments: list[dict[str, Any]] = []
    for i, start in enumerate(sorted_bounds[:-1]):
        end = sorted_bounds[i + 1]
        if end <= start:
            continue
        mid = start + (end - start) / 2
        has_scan = any(
            (r.finished_at or r.started_at) <= mid and r.status == "ok"
            for r in scan_runs
        )
        status = _control_status_at(check_ids, mapped_findings, mid, has_scan, events_by_finding)
        if segments and segments[-1]["status"] == status:
            segments[-1]["to"] = end.isoformat()
            segments[-1]["duration_seconds"] = int(
                (end - datetime.fromisoformat(segments[-1]["from"].replace("Z", "+00:00"))).total_seconds()
            )
        else:
            segments.append({
                "status": status,
                "from": start.isoformat(),
                "to": end.isoformat(),
                "duration_seconds": int((end - start).total_seconds()),
            })

    current_status = _control_status_at(
        check_ids,
        mapped_findings,
        now,
        any(r.status == "ok" for r in scan_runs),
        events_by_finding,
    )

    open_findings = [
        f for f in mapped_findings
        if finding_open_for_control(f, finding_state_at(f, now, events_by_finding.get(f.id)))
    ]
    failing_since: datetime | None = None
    if open_findings:
        failing_since = min(f.first_seen for f in open_findings)
    days_failing: int | None = None
    if failing_since:
        days_failing = max(0, (now - failing_since).days)

    events: list[dict[str, Any]] = []
    for run in scan_runs:
        ts = run.finished_at or run.started_at
        events.append({
            "timestamp": ts.isoformat(),
            "type": "scan_completed" if run.status == "ok" else f"scan_{run.status}",
            "detail": f"Scan {run.status}; +{run.findings_opened} / -{run.findings_resolved} findings",
        })

    finding_ids = [f.id for f in mapped_findings]
    if finding_ids:
        fevents = db.scalars(
            select(FindingEvent)
            .where(FindingEvent.finding_id.in_(finding_ids), FindingEvent.ts >= since)
            .order_by(FindingEvent.ts.asc())
        ).all()
        fmap = {f.id: f for f in mapped_findings}
        for evt in fevents:
            f = fmap.get(evt.finding_id)
            if not f:
                continue
            events.append({
                "timestamp": evt.ts.isoformat(),
                "type": f"finding_{evt.action}",
                "check_id": f.check_id,
                "resource_arn": f.resource_arn,
                "detail": evt.note or f.title,
            })

    for f in mapped_findings:
        if f.first_seen >= since:
            events.append({
                "timestamp": f.first_seen.isoformat(),
                "type": "finding_detected",
                "check_id": f.check_id,
                "resource_arn": f.resource_arn,
                "detail": f.title,
            })

    events.sort(key=lambda e: e["timestamp"])

    return {
        "control_id": control_id,
        "framework": framework,
        "title": ctrl.title,
        "current_status": current_status,
        "period_days": days,
        "failing_since": failing_since.isoformat() if failing_since else None,
        "days_failing": days_failing,
        "open_finding_count": len(open_findings),
        "segments": segments,
        "events": events,
    }


def build_compliance_timeline(
    db: Session,
    account_id: uuid.UUID,
    framework: str,
    days: int = 90,
    limit: int = 100,
) -> dict[str, Any]:
    """Aggregate control status changes across all controls in a framework."""
    controls = db.scalars(
        select(Control).where(Control.framework == framework).order_by(Control.control_id)
    ).all()

    entries: list[dict[str, Any]] = []
    failing_controls: list[dict[str, Any]] = []

    for ctrl in controls[:limit]:
        try:
            hist = build_control_history(db, account_id, framework, ctrl.control_id, days)
        except ValueError:
            continue

        if hist["current_status"] == "fail":
            failing_controls.append({
                "control_id": ctrl.control_id,
                "title": ctrl.title,
                "days_failing": hist["days_failing"],
                "open_finding_count": hist["open_finding_count"],
            })

        for evt in hist["events"]:
            entries.append({
                **evt,
                "control_id": ctrl.control_id,
                "control_title": ctrl.title,
            })

        if hist["current_status"] == "fail" and hist["failing_since"]:
            entries.append({
                "timestamp": hist["failing_since"],
                "type": "control_failing",
                "control_id": ctrl.control_id,
                "control_title": ctrl.title,
                "detail": f"{hist['open_finding_count']} open finding(s); failing for {hist['days_failing']} days",
            })
        elif hist["current_status"] == "pass":
            entries.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "type": "control_passing",
                "control_id": ctrl.control_id,
                "control_title": ctrl.title,
                "detail": "No open findings mapped to this control",
            })

    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return {
        "framework": framework,
        "period_days": days,
        "entries": entries[:limit],
        "failing_controls": sorted(
            failing_controls,
            key=lambda c: c.get("days_failing") or 0,
            reverse=True,
        ),
        "total_failing": len(failing_controls),
    }
