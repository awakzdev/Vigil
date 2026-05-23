from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamUser

CHECK_ID = "iam.user.no_mfa"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(IamUser).where(
            IamUser.account_id == account_id,
            IamUser.has_console_password == True,  # noqa: E712
            IamUser.mfa_enabled == False,  # noqa: E712
        )
    ).all()
    out: list[FindingDraft] = []
    for u in rows:
        out.append(
            FindingDraft(
                check_id=CHECK_ID,
                resource_arn=u.arn,
                title=f"User `{u.name}` has console access but no MFA",
                severity="high",
                risk_score=score("high"),
                evidence={"user_name": u.name},
            )
        )
    return out
