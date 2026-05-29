"""Verify customer-account EventBridge remediation runner (read-only)."""
from __future__ import annotations

from typing import Any

from botocore.exceptions import ClientError

from app.core.config import get_settings
from app.core.aws import assume_role
from app.models import AwsAccount

RULE_NAME = "VigilRemediationApproved"
LAMBDA_NAME = "VigilRemediationRunner"


def check_remediation_runner(acc: AwsAccount) -> dict[str, Any]:
    """
    Inspect EventBridge rule + Lambda in the remediation bus region.
    Warn when Schema Registry discovery is off (console default).
    """
    settings = get_settings()
    bus_region = settings.REMEDIATION_EVENT_BUS_REGION
    bus_name = settings.REMEDIATION_EVENT_BUS_NAME or "default"

    out: dict[str, Any] = {
        "event_bus_region": bus_region,
        "event_bus_name": bus_name,
        "ready": False,
        "rule": {"name": RULE_NAME, "exists": False, "state": None},
        "lambda": {"name": LAMBDA_NAME, "exists": False},
        "schema_discovery": {"enabled": None, "note": None},
        "blockers": [],
        "warnings": [],
        "hints": [],
    }

    if not acc.role_arn:
        out["blockers"].append("AWS account role not verified — connect account first")
        return out

    try:
        sess = assume_role(
            acc.role_arn,
            acc.external_id,
            session_name="vigil-remediation-check",
            aws_account=acc,
            purpose="remediation_runner_status",
        )
    except Exception as exc:  # noqa: BLE001
        out["blockers"].append(f"Cannot assume role: {exc}")
        return out

    events = sess.client("events", region_name=bus_region)
    lam = sess.client("lambda", region_name=bus_region)

    # Event bus exists
    try:
        bus = events.describe_event_bus(Name=bus_name)
        out["event_bus_arn"] = bus.get("Arn")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            out["blockers"].append(
                f"Event bus {bus_name!r} not found in {bus_region} — deploy "
                "infra/cfn/vigil-remediation-runner-ec2.yaml in this region first"
            )
        else:
            out["blockers"].append(f"Cannot describe event bus: {e}")
        return out

    # Rule
    rule_arn = None
    try:
        rule = events.describe_rule(Name=RULE_NAME, EventBusName=bus_name)
        out["rule"]["exists"] = True
        out["rule"]["state"] = rule.get("State")
        rule_arn = rule.get("Arn")
        if rule.get("State") != "ENABLED":
            out["blockers"].append(
                f"EventBridge rule {RULE_NAME} exists but State={rule.get('State')} — enable it in the console"
            )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            out["blockers"].append(
                f"Rule {RULE_NAME} not found on bus {bus_name} in {bus_region} — deploy or update the CFN stack"
            )
        else:
            out["blockers"].append(f"Cannot describe rule: {e}")

    # Targets
    if rule_arn:
        try:
            targets = events.list_targets_by_rule(Rule=RULE_NAME, EventBusName=bus_name)
            tgs = targets.get("Targets") or []
            out["rule"]["target_count"] = len(tgs)
            if not tgs:
                out["blockers"].append("EventBridge rule has no targets — redeploy CFN stack")
        except ClientError as e:
            out["warnings"].append(f"Could not list rule targets: {e}")

    # Lambda
    try:
        fn = lam.get_function(FunctionName=LAMBDA_NAME)
        out["lambda"]["exists"] = True
        out["lambda"]["runtime"] = fn.get("Configuration", {}).get("Runtime")
        out["lambda"]["arn"] = fn.get("Configuration", {}).get("FunctionArn")
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            out["blockers"].append(
                f"Lambda {LAMBDA_NAME} not found in {bus_region} — deploy vigil-remediation-runner-ec2.yaml"
            )
        else:
            out["blockers"].append(f"Cannot describe Lambda: {e}")

    # Schema discovery (optional; often disabled by default)
    try:
        schemas = sess.client("schemas", region_name=bus_region)
        discoverers = schemas.list_discoverers().get("Discoverers") or []
        bus_arn = out.get("event_bus_arn") or ""
        enabled = any(
            d.get("State") == "ACTIVE" and (bus_arn in (d.get("SourceArn") or "") or bus_name == "default")
            for d in discoverers
        )
        out["schema_discovery"]["enabled"] = enabled
        if not enabled:
            out["schema_discovery"]["note"] = (
                "EventBridge schema discovery is off (AWS default). Not required for Vigil custom "
                "events (vigil.security), but enable it in EventBridge → Schema registry → "
                "Discoverers if you want automatic schema capture."
            )
            out["warnings"].append(out["schema_discovery"]["note"])
    except ClientError:
        out["schema_discovery"]["enabled"] = None
        out["schema_discovery"]["note"] = "Could not read schema discoverers (schemas:ListDiscoverers missing on read role)"

    out["ready"] = not out["blockers"] and out["rule"].get("exists") and out["lambda"].get("exists")
    if out["ready"]:
        out["hints"] = [
            f"Stack looks active in {bus_region}. Use Prepare EventBridge, then put-events to that region.",
            "Re-scan after remediation so the plan matches live security group rules.",
        ]
    else:
        out["hints"] = [
            "Deploy: aws cloudformation deploy --region "
            f"{bus_region} --template-file infra/cfn/vigil-remediation-runner-ec2.yaml "
            "--capabilities CAPABILITY_NAMED_IAM",
            f"Set REMEDIATION_EVENT_BUS_REGION={bus_region} in Vigil .env to match the stack region.",
        ]
    return out
