import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

settings = get_settings()
_boto_cfg = Config(retries={"max_attempts": 8, "mode": "standard"}, user_agent_extra="vigil/0.1")


def assume_role(role_arn: str, external_id: str, session_name: str = "vigil-scan") -> boto3.Session:
    if settings.DEV_MODE:
        return boto3.Session()
    sts = boto3.client("sts", config=_boto_cfg)
    resp = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName=session_name,
        ExternalId=external_id,
        DurationSeconds=3600,
    )
    c = resp["Credentials"]
    return boto3.Session(
        aws_access_key_id=c["AccessKeyId"],
        aws_secret_access_key=c["SecretAccessKey"],
        aws_session_token=c["SessionToken"],
    )


def verify_account(role_arn: str, external_id: str) -> tuple[bool, str | None, str | None, str | None]:
    """Returns (ok, account_id, alias, error)."""
    try:
        sess = assume_role(role_arn, external_id, session_name="vigil-verify")
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
