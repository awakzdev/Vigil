from datetime import datetime, timezone

from app.models import Finding
from app.services.remediation_dispatch import build_remediation_dispatch
from app.services.remediation_plan import PLAN_SCHEMA, build_remediation_plan
import uuid


def _sg_finding(**ev) -> Finding:
    now = datetime.now(timezone.utc)
    base_ev = {"group_id": "sg-abc", "group_name": "test", "region": "us-east-2", "exposing_rules": [
        {"protocol": "tcp", "from_port": 3389, "to_port": 3389, "cidr": "0.0.0.0/0", "match_reason": "port_in_range"},
    ]}
    base_ev.update(ev)
    return Finding(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        account_id=uuid.uuid4(),
        check_id="ec2.security_group.unrestricted_rdp",
        resource_arn="arn:aws:ec2:us-east-2:123456789012:security-group/sg-abc",
        title="RDP open",
        severity="high",
        risk_score=80,
        status="open",
        evidence=base_ev,
        first_seen=now,
        last_seen=now,
    )


def test_remediation_plan_v2_fields():
    f = _sg_finding()
    plan = build_remediation_plan(f)
    assert plan["schema"] == PLAN_SCHEMA
    assert plan["resource_region"] == "us-east-2"
    assert plan["event_bus_region"]
    assert plan["exact_match_rules"]
    assert plan["expires_at"]
    assert plan["content_sha256"]


def test_dispatch_includes_approval_block():
    f = _sg_finding()
    out = build_remediation_dispatch(f, approved_by="user-abc")
    plan = out["plan"]
    assert "approval" in plan
    assert plan["approval"]["approved_by"] == "user-abc"
    assert plan["approval"]["approval_token"]
    assert plan["approval"]["approved_at"]


def test_preview_plan_has_no_approval():
    f = _sg_finding()
    plan = build_remediation_plan(f)
    assert "approval" not in plan


def test_dispatch_uses_event_bus_region_not_resource_region():
    f = _sg_finding()
    out = build_remediation_dispatch(f, approved_by="user-abc")
    bus = out["event_bus_region"]
    assert bus
    assert out["resource_region"] == "us-east-2"
    cli = out["cli"]["put_events"]
    assert f"--region {bus}" in cli or f"--region '{bus}'" in cli
    # put-events must not target the resource region when it differs from bus home
    if bus != "us-east-2":
        assert "--region us-east-2" not in cli


def test_sg_iac_no_terraform():
    from unittest.mock import MagicMock

    from app.services.iac_snippets import build_iac_remediation

    f = _sg_finding()
    db = MagicMock()
    db.scalar.return_value = None
    db.scalars.return_value.all.return_value = []
    out = build_iac_remediation(db, f, f.org_id)
    assert out["terraform"] is None
    assert out["iac_status"] == "automation_only"
    assert out["apply_paths"]["terraform_generic"] is False
    assert out["apply_paths"]["customer_automation"] is True
