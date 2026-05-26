from __future__ import annotations
from sqlalchemy.orm import Session
from app.checks.base import FindingDraft
from app.checks._identity_helpers import run_insufficient_reviews

CHECK_ID = "github.repo.insufficient_reviews"

def run(db: Session, account_id) -> list[FindingDraft]:
    return run_insufficient_reviews(db, account_id, "github", CHECK_ID)
