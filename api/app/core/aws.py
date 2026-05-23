import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

settings = get_settings()
_boto_cfg = Config(retries={"max_attempts": 8, "mode": "standard"}, user_agent_extra="cloud-hygiene/0.1")


def assume_role(role_arn: str, external_id: str, session_name: str = "cloud-hygiene-scan"):
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


def verify_account(role_arn: str, external_id: str) -> tuple[bool, str | None, str | None]:
    """Returns (ok, account_id, error)."""
    try:
        sess = assume_role(role_arn, external_id, session_name="cloud-hygiene-verify")
        ident = sess.client("sts", config=_boto_cfg).get_caller_identity()
        return True, ident["Account"], None
    except ClientError as e:
        return False, None, f"{e.response['Error'].get('Code')}: {e.response['Error'].get('Message')}"
    except Exception as e:  # noqa: BLE001
        return False, None, str(e)
