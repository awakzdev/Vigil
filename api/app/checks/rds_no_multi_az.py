from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import RdsInstance

CHECK_ID = "rds.instance.no_multi_az"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(RdsInstance).where(
            RdsInstance.account_id == account_id,
            RdsInstance.multi_az == False,  # noqa: E712
            RdsInstance.backup_retention_period >= 7,
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.arn,
            title=f"RDS instance `{r.db_instance_id}` with automated backups is not Multi-AZ",
            severity="medium",
            risk_score=score("medium"),
            evidence={"db_instance_id": r.db_instance_id, "backup_retention_period": r.backup_retention_period},
        )
        for r in rows
    ]
