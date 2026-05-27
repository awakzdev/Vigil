"""CIS 1.16 — IAM policies attached directly to users (not via groups/roles)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamUser

CHECK_ID = "iam.user.direct_policy_attachment"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(select(IamUser).where(IamUser.account_id == account_id)).all()
    out: list[FindingDraft] = []
    for u in rows:
        attached = u.attached_policies or []
        inline_names = list((u.inline_policies or {}).keys())
        if not attached and not inline_names:
            continue
        parts = []
        if attached:
            parts.append(f"{len(attached)} managed")
        if inline_names:
            parts.append(f"{len(inline_names)} inline")
        out.append(
            FindingDraft(
                check_id=CHECK_ID,
                resource_arn=u.arn,
                title=f"User `{u.name}` has {' and '.join(parts)} polic{'y' if sum([len(attached), len(inline_names)]) == 1 else 'ies'} attached directly",
                severity="medium",
                risk_score=score("medium"),
                evidence={
                    "user_name": u.name,
                    "attached_policies": attached,
                    "inline_policy_names": inline_names,
                },
            )
        )
    return out
