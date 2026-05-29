"""CIS 1.21 — restrict AWSCloudShellFullAccess."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamRole, IamUser

CHECK_ID = "iam.cloudshell_full_access_granted"

_CLOUDSHELL_MARKERS = (
    "AWSCloudShellFullAccess",
    "arn:aws:iam::aws:policy/AWSCloudShellFullAccess",
)


def _has_cloudshell_policy(attached: list) -> bool:
    for pol in attached or []:
        arn = (pol.get("policy_arn") or "").strip()
        name = (pol.get("policy_name") or "").strip()
        if any(m in arn or m == name for m in _CLOUDSHELL_MARKERS):
            return True
    return False


def run(db: Session, account_id) -> list[FindingDraft]:
    out: list[FindingDraft] = []

    users = db.scalars(select(IamUser).where(IamUser.account_id == account_id)).all()
    for u in users:
        if _has_cloudshell_policy(u.attached_policies):
            out.append(
                FindingDraft(
                    check_id=CHECK_ID,
                    resource_arn=u.arn,
                    title=f"IAM user `{u.name}` has AWSCloudShellFullAccess attached",
                    severity="medium",
                    risk_score=score("medium"),
                    evidence={"principal_type": "user", "username": u.name},
                )
            )

    roles = db.scalars(select(IamRole).where(IamRole.account_id == account_id)).all()
    for r in roles:
        if "/aws-service-role/" in r.arn:
            continue
        if _has_cloudshell_policy(r.attached_policies):
            out.append(
                FindingDraft(
                    check_id=CHECK_ID,
                    resource_arn=r.arn,
                    title=f"IAM role `{r.name}` has AWSCloudShellFullAccess attached",
                    severity="medium",
                    risk_score=score("medium"),
                    evidence={"principal_type": "role", "role_name": r.name},
                )
            )

    return out
