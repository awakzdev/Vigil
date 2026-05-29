"""CIS 1.1 — maintain current contact details."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import AwsAccount
from app.models.resources import AccountGovernance

CHECK_ID = "aws.account.contact_incomplete"


def run(db: Session, account_id) -> list[FindingDraft]:
    acc = db.get(AwsAccount, account_id)
    if not acc:
        return []
    row = db.scalar(select(AccountGovernance).where(AccountGovernance.account_id == account_id))
    if not row or row.collection_error or row.primary_contact_complete:
        return []
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:iam::{acc.account_id or 'unknown'}:account",
            title="AWS account primary contact information is incomplete",
            severity="low",
            risk_score=score("low"),
            evidence={
                "requirement": "Address, city, country, and phone on account contact",
                "snapshot": (row.contact_snapshot or {}).get("primary"),
            },
        )
    ]
