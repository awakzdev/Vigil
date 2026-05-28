"""Collect IAM Identity Center (SSO) directory users."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from botocore.exceptions import ClientError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.aws import assume_role
from app.models import AwsAccount
from app.models.resources import IdentityCenterUser

log = structlog.get_logger()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def collect_identity_center(db: Session, account: AwsAccount) -> int:
    sess = assume_role(
        account.role_arn,
        account.external_id,
        session_name="vigil-identity-center",
        aws_account=account,
        purpose="collect_identity_center",
    )
    count = 0
    try:
        # IAM Identity Center instance metadata lives on sso-admin, not the OIDC "sso" client.
        sso_admin = sess.client("sso-admin", region_name="us-east-1")
        instances = sso_admin.list_instances().get("Instances", [])
    except ClientError as exc:
        log.info(
            "collect_identity_center.no_sso",
            account_id=str(account.id),
            error=exc.response.get("Error", {}).get("Code"),
        )
        return 0

    for inst in instances:
        store_id = inst.get("IdentityStoreId")
        if not store_id:
            continue
        try:
            idstore = sess.client("identitystore", region_name=inst.get("Region", "us-east-1"))
            paginator = idstore.get_paginator("list_users")
            for page in paginator.paginate(IdentityStoreId=store_id):
                for u in page.get("Users", []):
                    user_id = u.get("UserId", "")
                    if not user_id:
                        continue
                    emails = [e.get("Value") for e in u.get("Emails", []) if e.get("Value")]
                    stmt = pg_insert(IdentityCenterUser).values(
                        id=uuid.uuid5(uuid.NAMESPACE_URL, f"{account.id}:ic:{store_id}:{user_id}"),
                        account_id=account.id,
                        identity_store_id=store_id,
                        user_id=user_id,
                        user_name=u.get("UserName"),
                        display_name=u.get("DisplayName"),
                        email=emails[0] if emails else None,
                        active=u.get("Active", True),
                        last_seen=_now(),
                    ).on_conflict_do_update(
                        index_elements=["account_id", "identity_store_id", "user_id"],
                        set_={
                            "user_name": u.get("UserName"),
                            "display_name": u.get("DisplayName"),
                            "email": emails[0] if emails else None,
                            "active": u.get("Active", True),
                            "last_seen": _now(),
                        },
                    )
                    db.execute(stmt)
                    count += 1
        except ClientError:
            continue

    db.commit()
    log.info("collect_identity_center.done", account_id=str(account.id), users=count)
    return count
