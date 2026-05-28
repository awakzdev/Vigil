"""CIS 1.22 — customer-managed policies with Action:* and Resource:* (full admin)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamRole

CHECK_ID = "iam.role.full_admin_policy"


def run(db: Session, account_id) -> list[FindingDraft]:
    roles = db.scalars(select(IamRole).where(IamRole.account_id == account_id)).all()
    out: list[FindingDraft] = []
    for r in roles:
        if "/aws-service-role/" in r.arn:
            continue
        inline_flagged = []
        for pname, doc in (r.inline_policies or {}).items():
            if _has_full_admin_allow(doc):
                inline_flagged.append(pname)

        attached_flagged = []
        for pol in (r.attached_policies or []):
            if pol.get("policy_type") == "aws_managed":
                continue
            stmts = pol.get("statements", [])
            if _has_full_admin_allow({"Statement": stmts}):
                attached_flagged.append(pol["policy_name"])

        if inline_flagged or attached_flagged:
            sources = []
            if inline_flagged:
                sources.append(f"inline: {', '.join(inline_flagged)}")
            if attached_flagged:
                sources.append(f"customer managed: {', '.join(attached_flagged)}")
            out.append(
                FindingDraft(
                    check_id=CHECK_ID,
                    resource_arn=r.arn,
                    title=f"Role `{r.name}` has full-admin policy (Action:* and Resource:*)",
                    severity="high",
                    risk_score=score("high", admin=True),
                    evidence={
                        "role_arn": r.arn,
                        "inline_policies_full_admin": inline_flagged,
                        "attached_policies_full_admin": attached_flagged,
                        "sources": sources,
                    },
                )
            )
    return out


def _has_full_admin_allow(doc: dict) -> bool:
    for stmt in doc.get("Statement", []):
        if stmt.get("Effect") != "Allow":
            continue
        action = stmt.get("Action", [])
        if isinstance(action, str):
            action = [action]
        if "*" not in action:
            continue
        resource = stmt.get("Resource", [])
        if isinstance(resource, str):
            resource = [resource]
        if "*" in resource:
            return True
    return False
