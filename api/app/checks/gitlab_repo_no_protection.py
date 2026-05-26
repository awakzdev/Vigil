from __future__ import annotations
from sqlalchemy.orm import Session
from app.checks.base import FindingDraft
from app.checks._identity_helpers import run_no_branch_protection

CHECK_ID = "gitlab.repo.no_branch_protection"

def run(db: Session, account_id) -> list[FindingDraft]:
    return run_no_branch_protection(db, account_id, "gitlab", CHECK_ID)
