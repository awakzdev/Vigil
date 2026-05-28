from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.checks.iam_role_exclusions import is_operational_check_excluded_role
from app.models import IamRole

CHECK_ID = "iam.role.unassumed_90d"
THRESHOLD_DAYS = 90


def run(db: Session, account_id) -> list[FindingDraft]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=THRESHOLD_DAYS)
    roles = db.scalars(select(IamRole).where(IamRole.account_id == account_id)).all()
    out: list[FindingDraft] = []
    for r in roles:
        if is_operational_check_excluded_role(r.arn, r.name):
            continue
        ref = r.last_assumed or r.created
        if ref and ref >= cutoff:
            continue
        days = (datetime.now(timezone.utc) - ref).days if ref else None
        out.append(
            FindingDraft(
                check_id=CHECK_ID,
                resource_arn=r.arn,
                title=f"Role `{r.name}` has not been assumed for {days or '90+'} days",
                severity="medium",
                risk_score=score("medium", age_days=days or THRESHOLD_DAYS),
                evidence={
                    "role_arn": r.arn,
                    "last_assumed": r.last_assumed.isoformat() if r.last_assumed else None,
                    "created": r.created.isoformat() if r.created else None,
                    "threshold_days": THRESHOLD_DAYS,
                    "days_since_used": days,
                },
            )
        )
    return out
