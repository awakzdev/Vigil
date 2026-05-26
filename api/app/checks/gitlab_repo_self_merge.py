from __future__ import annotations
from sqlalchemy.orm import Session
from app.checks.base import FindingDraft
from app.checks._identity_helpers import run_self_merge

CHECK_ID = "gitlab.repo.self_merge_allowed"

def run(db: Session, account_id) -> list[FindingDraft]:
    return run_self_merge(db, account_id, "gitlab", CHECK_ID)
