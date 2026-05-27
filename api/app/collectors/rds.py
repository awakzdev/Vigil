"""Collect RDS instance configuration per region."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from botocore.exceptions import ClientError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.models import AwsAccount
from app.models.resources import RdsInstance

log = structlog.get_logger()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_regions(sess) -> list[str]:
    ec2 = sess.client("ec2", region_name="us-east-1")
    return [
        r["RegionName"]
        for r in ec2.describe_regions(
            Filters=[{"Name": "opt-in-status", "Values": ["opt-in-not-required", "opted-in"]}]
        )["Regions"]
    ]


def collect_rds(db: Session, account: AwsAccount) -> int:
    sess = assume_role(account.role_arn, account.external_id, session_name="vigil-rds", aws_account=account, purpose="collect_rds")
    regions = _get_regions(sess)
    count = 0

    for region in regions:
        try:
            rds = sess.client("rds", region_name=region)
            paginator = rds.get_paginator("describe_db_instances")
            for page in paginator.paginate():
                for inst in page.get("DBInstances", []):
                    arn = inst["DBInstanceArn"]
                    stmt = pg_insert(RdsInstance).values(
                        id=uuid.uuid5(uuid.NAMESPACE_URL, f"{account.id}:{arn}"),
                        account_id=account.id,
                        db_instance_id=inst["DBInstanceIdentifier"],
                        arn=arn,
                        region=region,
                        publicly_accessible=inst.get("PubliclyAccessible", False),
                        storage_encrypted=inst.get("StorageEncrypted", False),
                        backup_retention_period=inst.get("BackupRetentionPeriod", 0),
                        engine=inst.get("Engine"),
                        last_seen=_now(),
                    ).on_conflict_do_update(
                        index_elements=["account_id", "arn"],
                        set_={
                            "publicly_accessible": inst.get("PubliclyAccessible", False),
                            "storage_encrypted": inst.get("StorageEncrypted", False),
                            "backup_retention_period": inst.get("BackupRetentionPeriod", 0),
                            "engine": inst.get("Engine"),
                            "last_seen": _now(),
                        },
                    )
                    db.execute(stmt)
                    count += 1
        except ClientError:
            continue

    db.commit()
    log.info("collect_rds.done", account_id=str(account.id), instances=count)
    return count
