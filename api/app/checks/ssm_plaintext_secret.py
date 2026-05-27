from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.collectors.extended import looks_like_secret_parameter
from app.models.resources import SsmParameter

CHECK_ID = "ssm.parameter.plaintext_secret"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(select(SsmParameter).where(SsmParameter.account_id == account_id)).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:ssm:{r.region}:*:parameter{r.parameter_name}",
            title=f"SSM parameter `{r.parameter_name}` looks sensitive but is stored as `{r.parameter_type}`",
            severity="high",
            risk_score=score("high"),
            evidence={"parameter_name": r.parameter_name, "parameter_type": r.parameter_type},
        )
        for r in rows
        if r.parameter_type == "String" and looks_like_secret_parameter(r.parameter_name)
    ]
