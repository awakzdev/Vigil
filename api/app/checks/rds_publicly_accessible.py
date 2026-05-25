from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import RdsInstance

CHECK_ID = "rds.instance.publicly_accessible"


def run(db: Session, account_id) -> list[FindingDraft]:
    instances = db.scalars(
        select(RdsInstance).where(
            RdsInstance.account_id == account_id,
            RdsInstance.publicly_accessible == True,  # noqa: E712
        )
    ).all()

    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=inst.arn,
            title=f"RDS instance `{inst.db_instance_id}` is publicly accessible",
            severity="high",
            risk_score=score("high"),
            evidence={"db_instance_id": inst.db_instance_id, "region": inst.region, "engine": inst.engine},
        )
        for inst in instances
    ]
