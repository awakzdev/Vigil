"""Collect CloudTrail trail configuration."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.models import AwsAccount
from app.models.resources import CloudTrailTrail

log = structlog.get_logger()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def collect_cloudtrail(db: Session, account: AwsAccount) -> int:
    sess = assume_role(account.role_arn, account.external_id, session_name="vigil-cloudtrail", aws_account=account, purpose="collect_cloudtrail")
    ct = sess.client("cloudtrail", region_name="us-east-1")
    s3 = sess.client("s3", region_name="us-east-1")
    count = 0

    trails = ct.describe_trails(includeShadowTrails=False).get("trailList", [])
    for t in trails:
        arn = t.get("TrailARN", "")
        name = t.get("Name", "")
        home_region = t.get("HomeRegion", "us-east-1")
        is_multi_region = t.get("IsMultiRegionTrail", False)
        log_validation = t.get("LogFileValidationEnabled", False)
        kms_key_id = t.get("KmsKeyId")
        s3_bucket_name = t.get("S3BucketName")
        cloudwatch_logs_enabled = bool(t.get("CloudWatchLogsLogGroupArn"))

        s3_bucket_public = False
        s3_bucket_logging_enabled = False
        if s3_bucket_name:
            try:
                pab = s3.get_public_access_block(Bucket=s3_bucket_name).get("PublicAccessBlockConfiguration", {})
                s3_bucket_public = not all([
                    pab.get("BlockPublicAcls", False),
                    pab.get("IgnorePublicAcls", False),
                    pab.get("BlockPublicPolicy", False),
                    pab.get("RestrictPublicBuckets", False),
                ])
            except ClientError:
                try:
                    acl = s3.get_bucket_acl(Bucket=s3_bucket_name)
                    for grant in acl.get("Grants", []):
                        grantee = grant.get("Grantee", {})
                        if grantee.get("URI") == "http://acs.amazonaws.com/groups/global/AllUsers":
                            s3_bucket_public = True
                            break
                except ClientError:
                    pass
            try:
                log_cfg = s3.get_bucket_logging(Bucket=s3_bucket_name).get("LoggingEnabled")
                s3_bucket_logging_enabled = log_cfg is not None
            except ClientError:
                pass

        try:
            status = ct.get_trail_status(Name=arn)
            is_logging = status.get("IsLogging", False)
        except Exception:  # noqa: BLE001
            is_logging = False

        stmt = pg_insert(CloudTrailTrail).values(
            id=uuid.uuid5(uuid.NAMESPACE_URL, f"{account.id}:{arn}"),
            account_id=account.id,
            arn=arn,
            name=name,
            home_region=home_region,
            is_multi_region=is_multi_region,
            is_logging=is_logging,
            log_validation_enabled=log_validation,
            kms_key_id=kms_key_id,
            s3_bucket_name=s3_bucket_name,
            s3_bucket_public=s3_bucket_public,
            s3_bucket_logging_enabled=s3_bucket_logging_enabled,
            cloudwatch_logs_enabled=cloudwatch_logs_enabled,
            last_seen=_now(),
        ).on_conflict_do_update(
            index_elements=["account_id", "arn"],
            set_={
                "is_multi_region": is_multi_region,
                "is_logging": is_logging,
                "log_validation_enabled": log_validation,
                "kms_key_id": kms_key_id,
                "s3_bucket_name": s3_bucket_name,
                "s3_bucket_public": s3_bucket_public,
                "s3_bucket_logging_enabled": s3_bucket_logging_enabled,
                "cloudwatch_logs_enabled": cloudwatch_logs_enabled,
                "last_seen": _now(),
            },
        )
        db.execute(stmt)
        count += 1

    db.commit()
    log.info("collect_cloudtrail.done", account_id=str(account.id), trails=count)
    return count
