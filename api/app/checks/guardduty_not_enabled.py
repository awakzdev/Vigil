from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import AwsAccount
from app.models.resources import GuardDutyDetector

CHECK_ID = "guardduty.detector.not_enabled"


def run(db: Session, account_id) -> list[FindingDraft]:
    acc = db.get(AwsAccount, account_id)
    if not acc:
        return []

    disabled = db.scalars(
        select(GuardDutyDetector).where(
            GuardDutyDetector.account_id == account_id,
            GuardDutyDetector.status != "ENABLED",
        )
    ).all()

    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:guardduty:{d.region}:{acc.account_id or 'unknown'}:detector/{d.detector_id}",
            title=f"GuardDuty is not enabled in {d.region}",
            severity="high",
            risk_score=score("high"),
            evidence={"region": d.region},
        )
        for d in disabled
    ]
