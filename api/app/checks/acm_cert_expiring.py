from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import AcmCertificate

CHECK_ID = "acm.certificate.expiring"


def run(db: Session, account_id) -> list[FindingDraft]:
    soon = datetime.now(timezone.utc) + timedelta(days=30)
    rows = db.scalars(
        select(AcmCertificate).where(
            AcmCertificate.account_id == account_id,
            AcmCertificate.status == "ISSUED",
            AcmCertificate.expires_at.is_not(None),
            AcmCertificate.expires_at <= soon,
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.certificate_arn,
            title=f"ACM certificate for `{r.domain_name}` expires within 30 days",
            severity="high",
            risk_score=score("high"),
            evidence={"domain_name": r.domain_name, "expires_at": r.expires_at.isoformat() if r.expires_at else None},
        )
        for r in rows
    ]
