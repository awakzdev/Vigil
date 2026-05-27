from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.collectors.extended import DEPRECATED_LAMBDA_RUNTIMES, is_deprecated_lambda_runtime
from app.models.resources import LambdaFunction

CHECK_ID = "lambda.function.deprecated_runtime"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(select(LambdaFunction).where(LambdaFunction.account_id == account_id)).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=r.arn,
            title=f"Lambda function `{r.function_name}` uses deprecated runtime `{r.runtime}`",
            severity="medium",
            risk_score=score("medium"),
            evidence={"function_name": r.function_name, "runtime": r.runtime},
        )
        for r in rows
        if is_deprecated_lambda_runtime(r.runtime)
    ]
