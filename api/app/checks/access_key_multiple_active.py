"""Check: IAM user has more than one active access key."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models import IamAccessKey

CHECK_ID = "iam.access_key.multiple_active"


def run(db: Session, account_id) -> list[FindingDraft]:
    rows = db.scalars(
        select(IamAccessKey).where(
            IamAccessKey.account_id == account_id,
            IamAccessKey.status == "Active",
        )
    ).all()

    by_user: dict[str, list[IamAccessKey]] = defaultdict(list)
    for k in rows:
        by_user[k.user_arn].append(k)

    out: list[FindingDraft] = []
    for user_arn, keys in by_user.items():
        if len(keys) < 2:
            continue
        username = user_arn.split("/")[-1]
        out.append(
            FindingDraft(
                check_id=CHECK_ID,
                resource_arn=user_arn,
                title=f"User `{username}` has {len(keys)} active access keys to review",
                severity="medium",
                risk_score=score("medium"),
                evidence={
                    "user_arn": user_arn,
                    "active_key_count": len(keys),
                    "keys": [
                        {
                            "key_id": k.key_id,
                            "created": k.created.isoformat() if k.created else None,
                            "last_used": k.last_used.isoformat() if k.last_used else None,
                            "last_used_service": k.last_used_service,
                        }
                        for k in sorted(keys, key=lambda x: x.created or datetime.min)
                    ],
                },
            )
        )
    return out
