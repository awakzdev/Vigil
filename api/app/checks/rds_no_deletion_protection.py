from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import RdsInstance

CHECK_ID = "rds.instance.no_deletion_protection"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(RdsInstance).where(
            RdsInstance.account_id == account_id,
            RdsInstance.deletion_protection == False,  # noqa: E712
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=getattr(r, "arn"),
            title="RDS instance `{db_instance_id}` does not have deletion protection enabled".format(**{"db_instance_id": getattr(r, "db_instance_id")}),
            severity="medium",
            risk_score=score("medium"),
            evidence={"db_instance_id": getattr(r, "db_instance_id")},
        )
        for r in rows
    ]
