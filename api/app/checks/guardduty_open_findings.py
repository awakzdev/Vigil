"""Check: GuardDuty has active (non-archived) findings."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import GuardDutyFinding

CHECK_ID = "guardduty.open_findings"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(GuardDutyFinding).where(
            GuardDutyFinding.account_id == account_id,
            GuardDutyFinding.archived == False,  # noqa: E712
        )
    ).all()
    if not rows:
        return []
    # One account-level finding summarizing open GuardDuty items
    high = [r for r in rows if float(r.severity or 0) >= 7]
    sev = "high" if high else "medium"
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:guardduty:::account/{account_id}/open-findings",
            title=f"GuardDuty has {len(rows)} active finding(s)",
            severity=sev,
            risk_score=score(sev),
            evidence={
                "open_finding_count": len(rows),
                "sample": [
                    {
                        "region": r.region,
                        "finding_id": r.finding_id,
                        "severity": r.severity,
                        "title": r.title,
                        "type": r.finding_type,
                    }
                    for r in rows[:25]
                ],
            },
        )
    ]
