from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import AwsAccount
from app.models.resources import CloudTrailTrail

CHECK_ID = "cloudtrail.trail.not_enabled"


def run(db: Session, account_id) -> list[FindingDraft]:
    acc = db.get(AwsAccount, account_id)
    if not acc:
        return []

    active = db.scalars(
        select(CloudTrailTrail).where(
            CloudTrailTrail.account_id == account_id,
            CloudTrailTrail.is_multi_region == True,  # noqa: E712
            CloudTrailTrail.is_logging == True,  # noqa: E712
        )
    ).first()

    if active:
        return []

    return [FindingDraft(
        check_id=CHECK_ID,
        resource_arn=f"arn:aws:cloudtrail:*:{acc.account_id or 'unknown'}:trail",
        title="No multi-region CloudTrail trail is enabled",
        severity="high",
        risk_score=score("high"),
        evidence={"account_id": acc.account_id},
    )]
