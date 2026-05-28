"""Check: custom AMI is very old (patch / lifecycle hygiene)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import Ec2Ami

CHECK_ID = "ec2.ami.aged"
_AGE_DAYS = 365


def run(db: Session, account_id) -> list[FindingDraft]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=_AGE_DAYS)
    rows = db.scalars(
        select(Ec2Ami).where(
            Ec2Ami.account_id == account_id,
            Ec2Ami.created_at.is_not(None),
            Ec2Ami.created_at < cutoff,
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.arn,
            title=f"AMI `{r.image_id}` is older than {_AGE_DAYS} days",
            severity="low",
            risk_score=score("low"),
            evidence={
                "image_id": r.image_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "age_days": _AGE_DAYS,
            },
        )
        for r in rows
    ]
