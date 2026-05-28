"""Evidence period coverage — how much of the requested audit window has scan data."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ScanRun


def parse_as_of(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        d = date.fromisoformat(value[:10])
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "as_of must be YYYY-MM-DD") from exc
    return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=timezone.utc)


def compute_evidence_coverage(
    db: Session,
    account_id: uuid.UUID,
    since: datetime,
    end: datetime,
    period_days: int,
) -> dict:
    """Return coverage metadata for UI and evidence pack manifest."""
    first_ok = db.scalar(
        select(func.min(ScanRun.started_at)).where(
            ScanRun.account_id == account_id,
            ScanRun.status == "ok",
        )
    )
    successful_in_period = db.scalar(
        select(func.count())
        .select_from(ScanRun)
        .where(
            ScanRun.account_id == account_id,
            ScanRun.status == "ok",
            ScanRun.started_at >= since,
            ScanRun.started_at <= end,
        )
    ) or 0

    if first_ok is None:
        days_with_data = 0
        coverage_start = None
    else:
        coverage_start = max(since, first_ok)
        if coverage_start > end:
            days_with_data = 0
        else:
            days_with_data = (end.date() - coverage_start.date()).days + 1

    days_with_data = min(days_with_data, period_days)
    return {
        "period_days": period_days,
        "period_start": since.isoformat(),
        "period_end": end.isoformat(),
        "first_successful_scan_at": first_ok.isoformat() if first_ok else None,
        "coverage_start": coverage_start.isoformat() if coverage_start and first_ok else None,
        "days_with_data": days_with_data,
        "days_requested": period_days,
        "successful_scans_in_period": successful_in_period,
        "coverage_ratio": round(days_with_data / period_days, 4) if period_days else 0,
        "coverage_label": f"{days_with_data} of {period_days} days",
        "warning": (
            "Evidence covers fewer days than the selected audit period. "
            "Connect earlier or extend monitoring before Type II sampling."
            if days_with_data < period_days
            else None
        ),
    }
