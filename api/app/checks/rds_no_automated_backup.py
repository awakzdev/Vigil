from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import RdsInstance

CHECK_ID = "rds.instance.no_automated_backup"


def run(db: Session, account_id) -> list[FindingDraft]:
    instances = db.scalars(
        select(RdsInstance).where(
            RdsInstance.account_id == account_id,
            RdsInstance.backup_retention_period <= 0,
        )
    ).all()

    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=inst.arn,
            title=f"RDS instance `{inst.db_instance_id}` automated backups are disabled",
            severity="medium",
            risk_score=score("medium"),
            evidence={
                "db_instance_id": inst.db_instance_id,
                "region": inst.region,
                "engine": inst.engine,
                "backup_retention_period": inst.backup_retention_period,
            },
        )
        for inst in instances
    ]
