"""Collect EC2 instances, EBS volumes, and per-region EBS encryption defaults."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from botocore.exceptions import ClientError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.models import AwsAccount
from app.models.resources import EbsEncryptionDefault, EbsVolume, Ec2Instance

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


def collect_ec2(db: Session, account: AwsAccount) -> dict:
    sess = assume_role(account.role_arn, account.external_id, session_name="vigil-ec2")
    regions = _get_regions(sess)
    instance_count = volume_count = ebs_count = 0

    for region in regions:
        try:
            client = sess.client("ec2", region_name=region)

            # EBS encryption by default (account-level setting, queried per region)
            try:
                ebs_resp = client.get_ebs_encryption_by_default()
                ebs_enabled = ebs_resp.get("EbsEncryptionByDefault", False)
            except ClientError:
                ebs_enabled = False

            stmt = pg_insert(EbsEncryptionDefault).values(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"{account.id}:ebs_default:{region}"),
                account_id=account.id,
                region=region,
                enabled=ebs_enabled,
                last_seen=_now(),
            ).on_conflict_do_update(
                index_elements=["account_id", "region"],
                set_={"enabled": ebs_enabled, "last_seen": _now()},
            )
            db.execute(stmt)
            ebs_count += 1

            # EC2 instances (paginated)
            paginator = client.get_paginator("describe_instances")
            for page in paginator.paginate(
                Filters=[{"Name": "instance-state-name", "Values": ["running", "stopped", "pending"]}]
            ):
                for reservation in page.get("Reservations", []):
                    for inst in reservation.get("Instances", []):
                        instance_id = inst["InstanceId"]
                        state = inst.get("State", {}).get("Name", "unknown")
                        instance_type = inst.get("InstanceType")
                        vpc_id = inst.get("VpcId")
                        subnet_id = inst.get("SubnetId")

                        # IMDSv2: HttpTokens == "required" means IMDSv2 enforced
                        metadata_options = inst.get("MetadataOptions", {})
                        imdsv2_required = metadata_options.get("HttpTokens") == "required"

                        sg_ids = [sg["GroupId"] for sg in inst.get("SecurityGroups", [])]

                        tags = {t["Key"]: t["Value"] for t in inst.get("Tags", [])}

                        stmt = pg_insert(Ec2Instance).values(
                            id=uuid.uuid5(uuid.NAMESPACE_URL, f"{account.id}:{region}:{instance_id}"),
                            account_id=account.id,
                            instance_id=instance_id,
                            region=region,
                            instance_type=instance_type,
                            state=state,
                            imdsv2_required=imdsv2_required,
                            vpc_id=vpc_id,
                            subnet_id=subnet_id,
                            security_group_ids=sg_ids,
                            tags=tags,
                            last_seen=_now(),
                        ).on_conflict_do_update(
                            index_elements=["account_id", "region", "instance_id"],
                            set_={
                                "state": state,
                                "imdsv2_required": imdsv2_required,
                                "vpc_id": vpc_id,
                                "subnet_id": subnet_id,
                                "security_group_ids": sg_ids,
                                "tags": tags,
                                "last_seen": _now(),
                            },
                        )
                        db.execute(stmt)
                        instance_count += 1

            # EBS volumes (paginated)
            volume_paginator = client.get_paginator("describe_volumes")
            for page in volume_paginator.paginate():
                for volume in page.get("Volumes", []):
                    volume_id = volume["VolumeId"]
                    attached_instance_ids = [
                        attachment.get("InstanceId")
                        for attachment in volume.get("Attachments", [])
                        if attachment.get("InstanceId")
                    ]
                    arn = f"arn:aws:ec2:{region}:{account.account_id or 'unknown'}:volume/{volume_id}"

                    stmt = pg_insert(EbsVolume).values(
                        id=uuid.uuid5(uuid.NAMESPACE_URL, f"{account.id}:{region}:{volume_id}"),
                        account_id=account.id,
                        region=region,
                        volume_id=volume_id,
                        arn=arn,
                        encrypted=volume.get("Encrypted", False),
                        state=volume.get("State", "unknown"),
                        size_gib=volume.get("Size"),
                        volume_type=volume.get("VolumeType"),
                        attached_instance_ids=attached_instance_ids,
                        last_seen=_now(),
                    ).on_conflict_do_update(
                        index_elements=["account_id", "region", "volume_id"],
                        set_={
                            "arn": arn,
                            "encrypted": volume.get("Encrypted", False),
                            "state": volume.get("State", "unknown"),
                            "size_gib": volume.get("Size"),
                            "volume_type": volume.get("VolumeType"),
                            "attached_instance_ids": attached_instance_ids,
                            "last_seen": _now(),
                        },
                    )
                    db.execute(stmt)
                    volume_count += 1

        except ClientError:
            continue

    db.commit()
    log.info("collect_ec2.done", account_id=str(account.id), instances=instance_count, volumes=volume_count, ebs_regions=ebs_count)
    return {"instances": instance_count, "volumes": volume_count, "ebs_regions": ebs_count}
