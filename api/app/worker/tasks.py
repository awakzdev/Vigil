from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.checks.persist import persist_findings
from app.checks.registry import ALL_CHECKS
from app.collectors.iam import collect_iam
from app.core.db import SessionLocal
from app.models import AwsAccount, ScanRun
from app.worker.celery_app import celery_app

log = structlog.get_logger()


@celery_app.task(name="app.worker.tasks.run_scan")
def run_scan(account_id: str) -> dict:
    db = SessionLocal()
    acc = db.get(AwsAccount, uuid.UUID(account_id))
    if not acc:
        return {"error": "account not found"}

    run = ScanRun(id=uuid.uuid4(), account_id=acc.id, status="running")
    db.add(run)
    db.commit()

    try:
        stats = collect_iam(db, acc)

        drafts = []
        check_ids_run: set[str] = set()
        for mod in ALL_CHECKS:
            check_ids_run.add(mod.CHECK_ID)
            drafts.extend(mod.run(db, acc.id))

        opened, resolved = persist_findings(
            db,
            org_id=acc.org_id,
            account_id=acc.id,
            drafts=drafts,
            check_ids_run=check_ids_run,
        )

        run.status = "ok"
        run.finished_at = datetime.now(timezone.utc)
        run.stats = stats | {"checks_run": list(check_ids_run), "drafts": len(drafts)}
        run.findings_opened = opened
        run.findings_resolved = resolved
        acc.last_scan_at = run.finished_at
        db.commit()
        log.info("scan.complete", account_id=str(acc.id), opened=opened, resolved=resolved)
        return {"ok": True, "opened": opened, "resolved": resolved}
    except Exception as e:  # noqa: BLE001
        run.status = "error"
        run.error = str(e)[:1900]
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        log.exception("scan.failed", account_id=str(acc.id))
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(name="app.worker.tasks.scan_all_accounts")
def scan_all_accounts() -> dict:
    db = SessionLocal()
    try:
        rows = db.scalars(select(AwsAccount).where(AwsAccount.status == "connected")).all()
        for acc in rows:
            run_scan.delay(str(acc.id))
        return {"queued": len(rows)}
    finally:
        db.close()
