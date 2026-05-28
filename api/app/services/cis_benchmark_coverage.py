"""CIS AWS Foundations coverage matrix (honest subset vs full benchmark)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_MAPPINGS_PATH = Path(__file__).parent.parent.parent / "data" / "control_mappings.json"

# CIS AWS Foundations Benchmark v5.0 Level 1 control count (reference for buyers/auditors).
CIS_V5_LEVEL1_TOTAL = 40


@lru_cache(maxsize=1)
def cis_benchmark_coverage() -> dict:
    raw = json.loads(_MAPPINGS_PATH.read_text())
    cis_rows = [e for e in raw if e.get("framework") == "cis_aws_l1"]
    controls = [
        {
            "control_id": e["control_id"],
            "title": e.get("title", ""),
            "check_ids": list(e.get("checks") or []),
            "status": "automated" if e.get("checks") else "manual",
        }
        for e in sorted(cis_rows, key=lambda x: x["control_id"])
    ]
    return {
        "framework": "cis_aws_l1",
        "reference_benchmark": "CIS Amazon Web Services Foundations Benchmark",
        "reference_versions": ["v3.0.0 (selected controls)", "v5.0.0 (40 Level 1 controls — not fully automated)"],
        "vigil_claim": "curated_subset",
        "cis_v5_level1_total": CIS_V5_LEVEL1_TOTAL,
        "mapped_control_count": len(controls),
        "coverage_ratio": round(len(controls) / CIS_V5_LEVEL1_TOTAL, 3) if CIS_V5_LEVEL1_TOTAL else 0,
        "disclaimer": (
            "Vigil automates a subset of CIS AWS Foundations controls mapped in control_mappings.json. "
            "This is not full CIS v5.0 Level 1 parity. Unmapped CIS controls require manual attestation."
        ),
        "controls": controls,
    }
