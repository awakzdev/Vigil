"""CIS 1.2 — security alternate contact registered."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import AwsAccount
from app.models.resources import AccountGovernance

CHECK_ID = "aws.account.security_contact_missing"


def run(db: Session, account_id) -> list[FindingDraft]:
    acc = db.get(AwsAccount, account_id)
    if not acc:
        return []
    row = db.scalar(select(AccountGovernance).where(AccountGovernance.account_id == account_id))
    if not row or row.collection_error or row.security_contact_complete:
        return []
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:iam::{acc.account_id or 'unknown'}:account",
            title="AWS account security alternate contact is not registered",
            severity="low",
            risk_score=score("low"),
            evidence={
                "requirement": "SECURITY alternate contact with email and phone",
                "snapshot": (row.contact_snapshot or {}).get("security"),
            },
        )
    ]
