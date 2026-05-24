"""Check: IAM role trust policy allows any principal (Principal: *)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamRole

CHECK_ID = "iam.role.trust_wildcard"


def _has_wildcard_principal(trust_policy: dict) -> bool:
    for stmt in trust_policy.get("Statement", []):
        if stmt.get("Effect") != "Allow":
            continue
        principal = stmt.get("Principal", {})
        if principal == "*":
            return True
        if isinstance(principal, dict):
            aws = principal.get("AWS", [])
            if aws == "*" or (isinstance(aws, list) and "*" in aws):
                return True
    return False


def run(db: Session, account_id) -> list[FindingDraft]:
    roles = db.scalars(select(IamRole).where(IamRole.account_id == account_id)).all()
    out: list[FindingDraft] = []
    for r in roles:
        if not r.trust_policy:
            continue
        if not _has_wildcard_principal(r.trust_policy):
            continue
        out.append(
            FindingDraft(
                check_id=CHECK_ID,
                resource_arn=r.arn,
                title=f"Role `{r.name}` has a wildcard trust policy",
                severity="critical",
                risk_score=score("critical"),
                evidence={
                    "role_arn": r.arn,
                    "trust_policy": r.trust_policy,
                },
            )
        )
    return out
