"""Optional hygiene: GitLab project has no CODEOWNERS file (off by default)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.checks._identity_helpers import run_no_codeowners

CHECK_ID = "gitlab.repo.no_codeowners"


def run(db: Session, account_id) -> list:
    return run_no_codeowners(db, account_id, "gitlab", CHECK_ID)
