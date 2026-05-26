"""Check: GitHub org has outside collaborators (non-members with direct repo access)."""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.github import IdentityProvider

CHECK_ID = "github.org.outside_collaborators"


def run(db: Session, account_id) -> list[FindingDraft]:
    providers = db.scalars(
        select(IdentityProvider).where(
            IdentityProvider.org_id == account_id,
            IdentityProvider.type == "github",
        )
    ).all()

    out: list[FindingDraft] = []
    for provider in providers:
        try:
            config = json.loads(provider.config_json_encrypted or "{}")
        except Exception:
            continue

        collaborators = config.get("outside_collaborators")
        if collaborators is None:
            continue  # not yet collected
        if not collaborators:
            continue

        org = config.get("org_login") or config.get("org_logins", ["unknown"])[0]
        out.append(FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"github://org/{org}",
            title=f"GitHub org `{org}` has {len(collaborators)} outside collaborator(s) with repo access",
            severity="medium",
            risk_score=score("medium"),
            evidence={
                "org": org,
                "outside_collaborator_logins": [c.get("login") for c in collaborators],
                "count": len(collaborators),
                "note": "Outside collaborators are non-org members with direct repository access — review and remove if no longer needed.",
            },
        ))
    return out
