from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamRole

CHECK_ID = "iam.role.wildcard_action"


def run(db: Session, account_id) -> list[FindingDraft]:
    roles = db.scalars(select(IamRole).where(IamRole.account_id == account_id)).all()
    out: list[FindingDraft] = []
    for r in roles:
        if "/aws-service-role/" in r.arn:
            continue
        flagged = []
        for pname, doc in (r.inline_policies or {}).items():
            if _has_wildcard_action(doc):
                flagged.append(pname)
        if flagged:
            out.append(
                FindingDraft(
                    check_id=CHECK_ID,
                    resource_arn=r.arn,
                    title=f"Role `{r.name}` has wildcard permissions in an inline policy",
                    severity="high",
                    risk_score=score("high", admin=True),
                    evidence={
                        "role_arn": r.arn,
                        "policies_with_wildcard": flagged,
                    },
                )
            )
    return out


def _has_wildcard_action(doc: dict) -> bool:
    for stmt in doc.get("Statement", []):
        if stmt.get("Effect") != "Allow":
            continue
        action = stmt.get("Action", [])
        if isinstance(action, str):
            action = [action]
        if "*" in action:
            return True
    return False
