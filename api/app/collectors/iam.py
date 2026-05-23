"""IAM collectors. Pull raw AWS data → upsert into normalized tables."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable

from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.models import AwsAccount, IamAccessKey, IamUser


def _now() -> datetime:
    return datetime.now(timezone.utc)


def collect_iam(db: Session, account: AwsAccount) -> dict:
    """Collect IAM users, console password state, MFA, access keys + last-used."""
    sess = assume_role(account.role_arn, account.external_id, session_name="cloud-hygiene-collect")
    iam = sess.client("iam")

    user_count = 0
    key_count = 0

    paginator = iam.get_paginator("list_users")
    for page in paginator.paginate():
        for u in page["Users"]:
            user_count += 1
            mfa_enabled = _has_mfa(iam, u["UserName"])
            has_pw = _has_console_password(iam, u["UserName"])
            _upsert_user(
                db,
                account.id,
                arn=u["Arn"],
                name=u["UserName"],
                created=u.get("CreateDate"),
                password_last_used=u.get("PasswordLastUsed"),
                has_console_password=has_pw,
                mfa_enabled=mfa_enabled,
            )
            for k in iam.list_access_keys(UserName=u["UserName"]).get("AccessKeyMetadata", []):
                key_count += 1
                last_used = iam.get_access_key_last_used(AccessKeyId=k["AccessKeyId"]).get("AccessKeyLastUsed", {})
                _upsert_key(
                    db,
                    account.id,
                    user_arn=u["Arn"],
                    key_id=k["AccessKeyId"],
                    status=k["Status"],
                    created=k.get("CreateDate"),
                    last_used=last_used.get("LastUsedDate"),
                    last_used_service=last_used.get("ServiceName"),
                    last_used_region=last_used.get("Region"),
                )

    db.commit()
    return {"iam_users": user_count, "iam_access_keys": key_count}


def _has_mfa(iam, username: str) -> bool:
    try:
        devices = iam.list_mfa_devices(UserName=username).get("MFADevices", [])
        return len(devices) > 0
    except ClientError:
        return False


def _has_console_password(iam, username: str) -> bool:
    try:
        iam.get_login_profile(UserName=username)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchEntity":
            return False
        raise


def _upsert_user(db: Session, account_id, *, arn, name, created, password_last_used, has_console_password, mfa_enabled):
    stmt = pg_insert(IamUser).values(
        id=uuid.uuid4(),
        account_id=account_id,
        arn=arn,
        name=name,
        created=created,
        password_last_used=password_last_used,
        has_console_password=has_console_password,
        mfa_enabled=mfa_enabled,
        last_seen_at=_now(),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["account_id", "arn"],
        set_={
            "name": stmt.excluded.name,
            "created": stmt.excluded.created,
            "password_last_used": stmt.excluded.password_last_used,
            "has_console_password": stmt.excluded.has_console_password,
            "mfa_enabled": stmt.excluded.mfa_enabled,
            "last_seen_at": stmt.excluded.last_seen_at,
        },
    )
    db.execute(stmt)


def _upsert_key(db: Session, account_id, *, user_arn, key_id, status, created, last_used, last_used_service, last_used_region):
    stmt = pg_insert(IamAccessKey).values(
        id=uuid.uuid4(),
        account_id=account_id,
        user_arn=user_arn,
        key_id=key_id,
        status=status,
        created=created,
        last_used=last_used,
        last_used_service=last_used_service,
        last_used_region=last_used_region,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["account_id", "key_id"],
        set_={
            "user_arn": stmt.excluded.user_arn,
            "status": stmt.excluded.status,
            "created": stmt.excluded.created,
            "last_used": stmt.excluded.last_used,
            "last_used_service": stmt.excluded.last_used_service,
            "last_used_region": stmt.excluded.last_used_region,
        },
    )
    db.execute(stmt)
