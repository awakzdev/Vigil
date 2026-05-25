from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import CloudTrailTrail

CHECK_ID = "cloudtrail.trail.no_log_validation"


def run(db: Session, account_id) -> list[FindingDraft]:
    trails = db.scalars(
        select(CloudTrailTrail).where(
            CloudTrailTrail.account_id == account_id,
            CloudTrailTrail.log_validation_enabled == False,  # noqa: E712
            CloudTrailTrail.is_logging == True,  # noqa: E712
        )
    ).all()

    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=t.arn,
            title=f"CloudTrail trail `{t.name}` does not have log file validation enabled",
            severity="medium",
            risk_score=score("medium"),
            evidence={"trail_name": t.name, "home_region": t.home_region},
        )
        for t in trails
    ]
