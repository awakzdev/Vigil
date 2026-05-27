from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import SecretsManagerSecret

CHECK_ID = "secretsmanager.secret.no_rotation"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(SecretsManagerSecret).where(
            SecretsManagerSecret.account_id == account_id,
            SecretsManagerSecret.rotation_enabled == False,  # noqa: E712
        )
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=getattr(r, "secret_arn"),
            title="Secrets Manager secret `{name}` does not have rotation enabled".format(**{"name": getattr(r, "name")}),
            severity="medium",
            risk_score=score("medium"),
            evidence={"name": getattr(r, "name")},
        )
        for r in rows
    ]
