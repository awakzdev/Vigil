from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import CloudTrailTrail

CHECK_ID = "cloudtrail.trail.s3_bucket_no_logging"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(CloudTrailTrail).where(
            CloudTrailTrail.account_id == account_id,
            CloudTrailTrail.is_logging == True,  # noqa: E712
            CloudTrailTrail.s3_bucket_name.is_not(None),
            CloudTrailTrail.s3_bucket_logging_enabled == False,  # noqa: E712
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=getattr(r, "arn"),
            title="CloudTrail S3 bucket for trail `{name}` has access logging disabled".format(**{"name": getattr(r, "name")}),
            severity="medium",
            risk_score=score("medium"),
            evidence={"name": getattr(r, "name")},
        )
        for r in rows
    ]
