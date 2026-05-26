from __future__ import annotations
from sqlalchemy.orm import Session
from app.checks.base import FindingDraft
from app.checks._identity_helpers import run_mfa_not_enforced

CHECK_ID = "gitlab.org.mfa_not_enforced"

def run(db: Session, account_id) -> list[FindingDraft]:
    return run_mfa_not_enforced(db, account_id, "gitlab", CHECK_ID)
