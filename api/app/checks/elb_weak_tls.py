from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.collectors.extended import is_weak_tls_policy
from app.models.resources import ElbLoadBalancer

CHECK_ID = "elb.load_balancer.weak_tls_policy"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(select(ElbLoadBalancer).where(ElbLoadBalancer.account_id == account_id)).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.load_balancer_arn,
            title=f"Load balancer `{r.name}` uses weak TLS policy `{r.ssl_policy}`",
            severity="high",
            risk_score=score("high"),
            evidence={"name": r.name, "ssl_policy": r.ssl_policy},
        )
        for r in rows
        if r.ssl_policy and is_weak_tls_policy(r.ssl_policy)
    ]
