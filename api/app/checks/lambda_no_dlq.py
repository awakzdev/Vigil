from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import LambdaFunction

CHECK_ID = "lambda.function.no_dlq"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(LambdaFunction).where(
            LambdaFunction.account_id == account_id,
            LambdaFunction.has_dlq == False,  # noqa: E712
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.arn,
            title=f"Lambda function `{r.function_name}` has no dead-letter queue configured",
            severity="low",
            risk_score=score("low"),
            evidence={"function_name": r.function_name},
        )
        for r in rows
    ]
