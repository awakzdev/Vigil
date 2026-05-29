"""Structured auditor-facing control narrative blocks (v2 audit template)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.control import Control
from app.services.check_evidence import evidence_class_label, evidence_class_for_check


def build_control_audit_block(
    ctrl: Control,
    cr: dict[str, Any],
    check_ids: list[str],
    *,
    since: datetime,
    end: datetime,
    evidence_sources: list[str],
) -> dict[str, Any]:
    status = cr.get("status", "no_data")
    open_count = cr.get("finding_count", 0)
    supporting_open = cr.get("supporting_open_count", 0)
    exceptions = cr.get("exception_count", 0)

    tested_lines = []
    for cid in check_ids:
        ec = evidence_class_for_check(cid)
        tested_lines.append(f"{cid} ({evidence_class_label(ec)})")

    if status == "pass":
        current = f"PASS — no open benchmark findings ({exceptions} approved exception(s))" if exceptions else "PASS — no open benchmark findings"
        next_step = "Continue monitoring; no benchmark remediation required."
    elif status == "fail":
        current = f"FAIL — {open_count} open benchmark finding(s)"
        if supporting_open:
            current += f"; {supporting_open} supporting finding(s) do not change pass/fail"
        next_step = "Remediate open findings or document approved exceptions with expiry."
    else:
        current = "NO DATA — no automated checks mapped or insufficient scan data in period"
        next_step = "Run scans across the audit period or supply manual attestation."

    return {
        "objective": (ctrl.description or ctrl.title or "").strip(),
        "what_vigil_tested": tested_lines,
        "evidence_collected": {
            "sources": evidence_sources,
            "period_start": since.isoformat(),
            "period_end": end.isoformat(),
            "snapshots_included": cr.get("snapshots_included", len(cr.get("snapshots", []))),
            "snapshots_total": cr.get("snapshots_total", 0),
        },
        "current_result": {
            "status": status,
            "open_benchmark_findings": open_count,
            "supporting_open_findings": supporting_open,
            "approved_exceptions": exceptions,
            "summary": current,
        },
        "why_it_matters": (ctrl.guidance or "").strip() or None,
        "what_vigil_does_not_prove": (
            "Company policies, HR attestations, vendor risk questionnaires, "
            "and incident-response runbooks are outside automated technical collection."
        ),
        "recommended_next_step": next_step,
    }
