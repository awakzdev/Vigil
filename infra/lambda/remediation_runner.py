"""
Canonical Vigil remediation Lambda handler (EC2 security groups).

Embedded in CloudFormation ZipFile — keep infra/cfn/*.yaml in sync when editing.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

PLAN_SCHEMA_V2 = "vigil_remediation_plan/v2"
SG_CHECKS = frozenset(
    {
        "ec2.security_group.unrestricted_ssh",
        "ec2.security_group.unrestricted_rdp",
    }
)


def _plan(event: dict) -> dict:
    detail = event.get("detail") or event
    if isinstance(detail, str):
        detail = json.loads(detail)
    return detail


def _verify_plan(plan: dict) -> str | None:
    """Return error string or None if valid."""
    schema = plan.get("schema")
    if schema != PLAN_SCHEMA_V2:
        return f"unsupported schema {schema} (need {PLAN_SCHEMA_V2})"

    expires = plan.get("expires_at")
    if not expires:
        return "missing expires_at"
    try:
        exp = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
    except ValueError:
        return "invalid expires_at"
    if datetime.now(timezone.utc) > exp:
        return "plan_expired"

    body = {k: v for k, v in plan.items() if k != "signature"}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    expected = plan.get("content_sha256")
    if expected and hashlib.sha256(canonical.encode()).hexdigest() != expected:
        return "content_sha256_mismatch"

    sig = plan.get("signature")
    pub_b64 = (os.environ.get("REMEDIATION_SIGNING_PUBLIC_KEY_B64") or "").strip()
    if sig and pub_b64:
        if not _verify_ed25519(canonical.encode(), sig, pub_b64):
            return "invalid_signature"
    elif sig and not pub_b64:
        log.warning("plan has signature but REMEDIATION_SIGNING_PUBLIC_KEY_B64 not set on Lambda")

    return None


def _verify_ed25519(payload: bytes, sig_doc: dict, pub_b64: str) -> bool:
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    except ImportError:
        log.warning("cryptography not available — skipping signature verify")
        return True
    if hashlib.sha256(payload).hexdigest() != sig_doc.get("payload_sha256"):
        return False
    pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(pub_b64))
    pub.verify(base64.b64decode(sig_doc["signature_base64"]), payload)
    return True


def _region_from_plan(plan: dict) -> str:
    if isinstance(plan.get("resource_region"), str) and plan["resource_region"]:
        return plan["resource_region"]
    ev = plan.get("evidence") or {}
    if isinstance(ev.get("region"), str) and ev["region"]:
        return ev["region"]
    arn = plan.get("resource_arn") or ""
    m = re.search(r"arn:aws:ec2:([a-z0-9-]+):", arn)
    return m.group(1) if m else "us-east-1"


def _sg_from_plan(plan: dict) -> str:
    ev = plan.get("evidence") or {}
    gid = ev.get("group_id")
    if gid:
        return str(gid)
    arn = plan.get("resource_arn") or ""
    if "/security-group/" in arn:
        return arn.split("/security-group/")[-1]
    return arn.split("/")[-1]


def _port_for_check(check_id: str) -> int:
    return 22 if "ssh" in check_id else 3389


def _perm_to_match(perm: dict, cidr: str, range_key: str) -> dict | None:
    proto = str(perm.get("IpProtocol", ""))
    fp, tp = perm.get("FromPort"), perm.get("ToPort")
    field = "CidrIp" if range_key == "IpRanges" else "CidrIpv6"
    return {
        "protocol": "all" if proto == "-1" else proto,
        "from_port": fp,
        "to_port": tp,
        "cidr": cidr,
        "range_key": range_key,
        "field": field,
    }


def _live_matches_rule(live: dict, rule: dict) -> bool:
    if live.get("cidr") != rule.get("cidr"):
        return False
    r_proto = rule.get("protocol")
    l_proto = live.get("protocol")
    if r_proto == "all" or l_proto == "all":
        if r_proto not in ("all", l_proto) and l_proto not in ("all", r_proto, "-1"):
            return False
    elif str(l_proto) != str(r_proto):
        return False
    for key in ("from_port", "to_port"):
        rv, lv = rule.get(key), live.get(key)
        if rv is None and lv is None:
            continue
        if rv is None or lv is None:
            return False
        if int(rv) != int(lv):
            return False
    return True


def _revoke_exact_rules(ec2, sg_id: str, rules: list[dict]) -> list[dict]:
    if not rules:
        return []
    sg = ec2.describe_security_groups(GroupIds=[sg_id])["SecurityGroups"][0]
    revoked: list[dict] = []

    for perm in sg.get("IpPermissions", []):
        for range_key, public_cidr in (("IpRanges", "0.0.0.0/0"), ("Ipv6Ranges", "::/0")):
            for rng in perm.get(range_key, []):
                cidr = rng.get("CidrIp") if range_key == "IpRanges" else rng.get("CidrIpv6")
                if cidr != public_cidr:
                    continue
                live = _perm_to_match(perm, cidr, range_key)
                if not live:
                    continue
                for rule in rules:
                    if rule.get("cidr") != cidr:
                        continue
                    if not _live_matches_rule(live, rule):
                        continue
                    proto = str(perm.get("IpProtocol", ""))
                    ip_perm: dict = {"IpProtocol": proto}
                    if proto != "-1":
                        ip_perm["FromPort"] = perm.get("FromPort")
                        ip_perm["ToPort"] = perm.get("ToPort")
                    if range_key == "IpRanges":
                        ip_perm["IpRanges"] = [{"CidrIp": cidr}]
                    else:
                        ip_perm["Ipv6Ranges"] = [{"CidrIpv6": cidr}]
                    ec2.revoke_security_group_ingress(GroupId=sg_id, IpPermissions=[ip_perm])
                    entry = {**rule, "revoked": True}
                    revoked.append(entry)
                    log.info("revoked exact rule %s", entry)
                    break
    return revoked


def _persist_execution(plan: dict, result: dict) -> None:
    plan_id = plan.get("plan_id")
    if not plan_id:
        return
    table = (os.environ.get("REMEDIATION_EXECUTIONS_TABLE") or "").strip()
    if table:
        try:
            ddb = boto3.resource("dynamodb")
            item = {
                "plan_id": plan_id,
                "check_id": plan.get("check_id", ""),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "ok": bool(result.get("ok")),
                "result": result,
            }
            ddb.Table(table).put_item(Item=item)
        except Exception:  # noqa: BLE001
            log.exception("dynamodb execution persist failed")

    webhook = (os.environ.get("VIGIL_EXECUTION_WEBHOOK_URL") or "").strip()
    sha = plan.get("content_sha256")
    if webhook and sha:
        try:
            body = json.dumps(
                {"plan_id": plan_id, "content_sha256": sha, "result": result}
            ).encode()
            req = urllib.request.Request(
                webhook,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Vigil-Content-Sha256": sha,
                },
                method="POST",
            )
            urllib.request.urlopen(req, timeout=10)
        except urllib.error.URLError as exc:
            log.warning("execution webhook failed: %s", exc)
        except Exception:  # noqa: BLE001
            log.exception("execution webhook error")


def _finish(plan: dict, result: dict) -> dict:
    result = {**result, "plan_id": plan.get("plan_id")}
    _persist_execution(plan, result)
    log.info("vigil remediation done %s", json.dumps(result))
    return result


def handler(event, context):
    plan = _plan(event)
    plan_id = plan.get("plan_id", "")
    check_id = plan.get("check_id", "")
    region = _region_from_plan(plan)
    sg_id = _sg_from_plan(plan)

    log.info(
        "vigil remediation start plan_id=%s check_id=%s resource_region=%s sg_id=%s",
        plan_id,
        check_id,
        region,
        sg_id,
    )

    err = _verify_plan(plan)
    if err:
        log.error("plan validation failed: %s", err)
        return _finish(plan, {"ok": False, "error": err, "plan_id": plan_id})

    if check_id not in SG_CHECKS:
        return _finish(plan, {"ok": False, "error": f"unsupported check_id {check_id}"})

    if not sg_id:
        return _finish(plan, {"ok": False, "error": "missing security group id"})

    rules = plan.get("exact_match_rules") or []
    if not rules:
        return _finish(
            plan,
            {
                "ok": False,
                "error": "stale_plan",
                "hint": "Plan has no exact_match_rules — re-scan in Vigil and publish a fresh event.",
            },
        )

    ec2 = boto3.client("ec2", region_name=region)
    try:
        revoked = _revoke_exact_rules(ec2, sg_id, rules)
    except ClientError as exc:
        log.exception("ec2 error")
        return _finish(
            plan,
            {"ok": False, "error": str(exc), "region": region, "group_id": sg_id},
        )

    if not revoked:
        return _finish(
            plan,
            {
                "ok": False,
                "error": "stale_plan",
                "hint": "Live SG no longer matches approved exposing_rules. Re-scan and publish a new plan.",
                "region": region,
                "group_id": sg_id,
            },
        )

    return _finish(
        plan,
        {
            "ok": True,
            "action": "revoke_exact_ingress",
            "group_id": sg_id,
            "region": region,
            "revoked": len(revoked),
            "rules": revoked,
        },
    )
