from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import AwsAccount
from app.models.resources import Vpc

CHECK_ID = "vpc.flow_logs.not_enabled"


def run(db: Session, account_id) -> list[FindingDraft]:
    acc = db.get(AwsAccount, account_id)
    if not acc:
        return []

    vpcs = db.scalars(
        select(Vpc).where(
            Vpc.account_id == account_id,
            Vpc.flow_logs_enabled == False,  # noqa: E712
        )
    ).all()

    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:ec2:{v.region}:{acc.account_id or 'unknown'}:vpc/{v.vpc_id}",
            title=f"VPC `{v.vpc_id}` in {v.region} does not have flow logs enabled",
            severity="medium",
            risk_score=score("medium"),
            evidence={"vpc_id": v.vpc_id, "region": v.region},
        )
        for v in vpcs
    ]
