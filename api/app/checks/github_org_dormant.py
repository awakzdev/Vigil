from __future__ import annotations
from sqlalchemy.orm import Session
from app.checks.base import FindingDraft
from app.checks._identity_helpers import run_dormant_members

CHECK_ID = "github.org.dormant_members"

def run(db: Session, account_id) -> list[FindingDraft]:
    return run_dormant_members(db, account_id, "github", CHECK_ID)
