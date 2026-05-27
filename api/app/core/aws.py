from __future__ import annotations

import os
import uuid
from typing import TYPE_CHECKING

import boto3
import structlog
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

if TYPE_CHECKING:
    from app.models import AwsAccount

log = structlog.get_logger()

# Docker Compose passes unset vars as empty strings, which breaks boto3's
# credential chain (e.g. AWS_PROFILE="" → "profile () not found").
for _var in ("AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"):
    if _var in os.environ and os.environ[_var] == "":
        del os.environ[_var]

settings = get_settings()
_boto_cfg = Config(retries={"max_attempts": 8, "mode": "standard"}, user_agent_extra="vigil/0.1")


def _audit_assume_role(
    *,
    aws_account: "AwsAccount | None",
    role_arn: str | None,
    session_name: str,
    purpose: str | None,
    success: bool,
    error_code: str | None,
    error_message: str | None,
) -> None:
    """Persist an audit log row for every sts:AssumeRole attempt.

    Uses a fresh DB session so the audit write is isolated from any caller's
    transaction (the caller might roll back, but the audit row must survive).
    Errors writing the audit log are logged but never raised — we don't want
    audit-table failures to break a scan.
    """
    try:
        from app.core.db import SessionLocal
        from app.models import AssumeRoleAudit

        db = SessionLocal()
        try:
            db.add(AssumeRoleAudit(
                id=uuid.uuid4(),
                org_id=aws_account.org_id if aws_account is not None else None,
                aws_account_id=aws_account.id if aws_account is not None else None,
                role_arn=role_arn,
                session_name=session_name[:120] if session_name else None,
                purpose=(purpose or session_name or "")[:80] or None,
                success=success,
                error_code=(error_code or "")[:120] or None,
                error_message=(error_message or "")[:500] or None,
            ))
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001
        log.exception("assume_role_audit.write_failed")


def assume_role(
    role_arn: str,
    external_id: str,
    session_name: str = "vigil-scan",
    *,
    aws_account: "AwsAccount | None" = None,
    purpose: str | None = None,
) -> boto3.Session:
    """Assume the customer's read-only role and return a session.

    Every call (success or failure) is logged to `assume_role_audit` for
    customer transparency and forensic trail. Pass `aws_account` so the
    audit row is associated with the right org/account; omitting it still
    creates an audit row but without those FKs.
    """
    if settings.DEV_MODE:
        return boto3.Session()
    sts = boto3.client("sts", config=_boto_cfg)
    try:
        resp = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName=session_name,
            ExternalId=external_id,
            DurationSeconds=3600,
        )
    except ClientError as e:
        err = e.response.get("Error", {})
        _audit_assume_role(
            aws_account=aws_account,
            role_arn=role_arn,
            session_name=session_name,
            purpose=purpose,
            success=False,
            error_code=err.get("Code"),
            error_message=err.get("Message"),
        )
        raise
    except Exception as e:  # noqa: BLE001
        _audit_assume_role(
            aws_account=aws_account,
            role_arn=role_arn,
            session_name=session_name,
            purpose=purpose,
            success=False,
            error_code=type(e).__name__,
            error_message=str(e),
        )
        raise

    _audit_assume_role(
        aws_account=aws_account,
        role_arn=role_arn,
        session_name=session_name,
        purpose=purpose,
        success=True,
        error_code=None,
        error_message=None,
    )

    c = resp["Credentials"]
    return boto3.Session(
        aws_access_key_id=c["AccessKeyId"],
        aws_secret_access_key=c["SecretAccessKey"],
        aws_session_token=c["SessionToken"],
    )


def verify_account(
    role_arn: str,
    external_id: str,
    *,
    aws_account: "AwsAccount | None" = None,
) -> tuple[bool, str | None, str | None, str | None]:
    """Returns (ok, account_id, alias, error)."""
    try:
        sess = assume_role(
            role_arn,
            external_id,
            session_name="vigil-verify",
            aws_account=aws_account,
            purpose="verify",
        )
        ident = sess.client("sts", config=_boto_cfg).get_caller_identity()
        account_id = ident["Account"]
        alias = None
        try:
            org = sess.client("organizations", config=_boto_cfg, region_name="us-east-1")
            alias = org.describe_account(AccountId=account_id)["Account"]["Name"]
        except ClientError:
            pass
        if not alias:
            try:
                aliases = sess.client("iam", config=_boto_cfg).list_account_aliases().get("AccountAliases", [])
                alias = aliases[0] if aliases else None
            except ClientError:
                pass
        return True, account_id, alias, None
    except ClientError as e:
        return False, None, None, f"{e.response['Error'].get('Code')}: {e.response['Error'].get('Message')}"
    except Exception as e:  # noqa: BLE001
        return False, None, None, str(e)
