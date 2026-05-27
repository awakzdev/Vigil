from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import ElbLoadBalancer

CHECK_ID = "elb.load_balancer.no_access_logs"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(ElbLoadBalancer).where(
            ElbLoadBalancer.account_id == account_id,
            ElbLoadBalancer.access_logs_enabled == False,  # noqa: E712
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=getattr(r, "load_balancer_arn"),
            title="Load balancer `{name}` does not have access logging enabled".format(**{"name": getattr(r, "name")}),
            severity="medium",
            risk_score=score("medium"),
            evidence={"name": getattr(r, "name")},
        )
        for r in rows
    ]
