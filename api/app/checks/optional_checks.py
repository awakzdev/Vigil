"""Optional hygiene checks — hidden from findings and evidence by default.

Not mapped to CIS, ISO 27001, or SOC 2 controls. Enable under Detection coverage when you want
extra least-privilege signal beyond benchmark scope.
"""

OPTIONAL_CHECKS: list[dict] = [
    {
        "check_id": "iam.policy.wildcard_resource",
        "label": "Wildcard resource in policy",
        "summary": "Write actions on Resource: *",
        "description": (
            "Customer-managed policies that grant write or sensitive actions on Resource: \"*\". "
            "CIS, ISO 27001, and SOC 2 only require fixing full admin (Action: * with Resource: *). "
            "Many AWS read APIs require Resource: * — including IAM last-accessed calls Vigil uses "
            "during scans — and are not flagged."
        ),
        "default_enabled": False,
    },
    {
        "check_id": "iam.policy.unattached",
        "label": "Unattached managed policies",
        "summary": "Customer-managed policy with zero attachments",
        "description": (
            "Policies not attached to any user, group, or role. Useful for IAM cleanup — not a "
            "scored CIS, SOC 2, or ISO control. Off by default so Findings focus on benchmark-relevant issues."
        ),
        "default_enabled": False,
    },
]

OPTIONAL_CHECK_IDS = frozenset(c["check_id"] for c in OPTIONAL_CHECKS)
OPTIONAL_BY_ID = {c["check_id"]: c for c in OPTIONAL_CHECKS}
