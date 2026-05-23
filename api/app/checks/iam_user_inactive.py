from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamUser

CHECK_ID = "iam.user.inactive_90d"
THRESHOLD_DAYS = 90


def run(db: Session, account_id) -> list[FindingDraft]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=THRESHOLD_DAYS)
    rows = db.scalars(select(IamUser).where(IamUser.account_id == account_id)).all()
    out: list[FindingDraft] = []
    for u in rows:
        # Only flag users with console access (otherwise inactivity is meaningless)
        if not u.has_console_password:
            continue
        last = u.password_last_used
        if last and last >= cutoff:
            continue
        days = _days_since(last)
        out.append(
            FindingDraft(
                check_id=CHECK_ID,
                resource_arn=u.arn,
                title=f"User `{u.name}` hasn't logged in {days or '90+'} days",
                severity="medium",
                risk_score=score("medium", age_days=days or THRESHOLD_DAYS),
                evidence={
                    "user_name": u.name,
                    "password_last_used": last.isoformat() if last else None,
                    "threshold_days": THRESHOLD_DAYS,
                    "days_inactive": days,
                },
            )
        )
    return out


def _days_since(ts) -> int | None:
    if not ts:
        return None
    return (datetime.now(timezone.utc) - ts).days
