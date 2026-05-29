"""Collect CloudTrail trail configuration."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from botocore.exceptions import ClientError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.models import AwsAccount
from app.models.resources import CloudTrailTrail

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


def _discover_trails(sess) -> list[dict]:
    """Return trail metadata from every opted-in region (deduped by ARN).

    describe_trails is region-scoped; a trail whose home region is not us-east-1
    is invisible to a single-region collector. get_trail_status must run in the
    trail's home region.
    """
    seen: set[str] = set()
    trails: list[dict] = []
    for region in _get_regions(sess):
        try:
            ct = sess.client("cloudtrail", region_name=region)
            for t in ct.describe_trails(includeShadowTrails=False).get("trailList", []):
                arn = t.get("TrailARN", "")
                if not arn or arn in seen:
                    continue
                seen.add(arn)
                trails.append(t)
        except ClientError as e:
            log.warning(
                "collect_cloudtrail.describe_failed",
                region=region,
                error_code=e.response.get("Error", {}).get("Code"),
            )
    return trails


def _trail_is_logging(sess, trail: dict) -> bool:
    home_region = trail.get("HomeRegion") or "us-east-1"
    name = trail.get("Name", "")
    arn = trail.get("TrailARN", "")
    ct = sess.client("cloudtrail", region_name=home_region)
    for identifier in (name, arn):
        if not identifier:
            continue
        try:
            return bool(ct.get_trail_status(Name=identifier).get("IsLogging", False))
        except ClientError:
            continue
    return False


def _inspect_s3_bucket(sess, bucket_name: str) -> tuple[bool, bool]:
    """Return (s3_bucket_public, s3_bucket_logging_enabled)."""
    s3_bucket_public = False
    s3_bucket_logging_enabled = False
    s3 = sess.client("s3", region_name="us-east-1")
    try:
        pab = s3.get_public_access_block(Bucket=bucket_name).get("PublicAccessBlockConfiguration", {})
        s3_bucket_public = not all([
            pab.get("BlockPublicAcls", False),
            pab.get("IgnorePublicAcls", False),
            pab.get("BlockPublicPolicy", False),
            pab.get("RestrictPublicBuckets", False),
        ])
    except ClientError:
        try:
            acl = s3.get_bucket_acl(Bucket=bucket_name)
            for grant in acl.get("Grants", []):
                grantee = grant.get("Grantee", {})
                if grantee.get("URI") == "http://acs.amazonaws.com/groups/global/AllUsers":
                    s3_bucket_public = True
                    break
        except ClientError:
            pass
    try:
        log_cfg = s3.get_bucket_logging(Bucket=bucket_name).get("LoggingEnabled")
        s3_bucket_logging_enabled = log_cfg is not None
    except ClientError:
        pass
    return s3_bucket_public, s3_bucket_logging_enabled


def collect_cloudtrail(db: Session, account: AwsAccount) -> int:
    sess = assume_role(
        account.role_arn,
        account.external_id,
        session_name="vigil-cloudtrail",
        aws_account=account,
        purpose="collect_cloudtrail",
    )
    count = 0

    for t in _discover_trails(sess):
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
            s3_bucket_public, s3_bucket_logging_enabled = _inspect_s3_bucket(sess, s3_bucket_name)

        is_logging = _trail_is_logging(sess, t)

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
