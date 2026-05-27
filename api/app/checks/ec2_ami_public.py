from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import Ec2Ami

CHECK_ID = "ec2.ami.public"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(Ec2Ami).where(
            Ec2Ami.account_id == account_id,
            Ec2Ami.is_public == True,  # noqa: E712
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=getattr(r, "arn"),
            title="EC2 AMI `{image_id}` is public".format(**{"image_id": getattr(r, "image_id")}),
            severity="high",
            risk_score=score("high"),
            evidence={"image_id": getattr(r, "image_id")},
        )
        for r in rows
    ]
