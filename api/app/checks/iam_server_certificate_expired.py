"""CIS 1.18 — remove expired IAM server certificates."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import IamServerCertificate

CHECK_ID = "iam.server_certificate.expired"


def run(db: Session, account_id) -> list[FindingDraft]:
    now = datetime.now(timezone.utc)
    rows = db.scalars(
        select(IamServerCertificate).where(
            IamServerCertificate.account_id == account_id,
            IamServerCertificate.expires_at.is_not(None),
            IamServerCertificate.expires_at < now,
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.arn,
            title=f"IAM server certificate `{r.name}` is expired",
            severity="medium",
            risk_score=score("medium"),
            evidence={
                "certificate_name": r.name,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            },
        )
        for r in rows
    ]
