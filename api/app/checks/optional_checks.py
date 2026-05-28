"""Optional hygiene checks — hidden from findings and evidence by default.

Not mapped to CIS, ISO 27001, or SOC 2 controls. Enable under Detection coverage when you want
extra IAM cleanup signal beyond benchmark scope.
"""

OPTIONAL_CHECKS: list[dict] = [
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
    {
        "check_id": "github.repo.no_codeowners",
        "label": "GitHub repo missing CODEOWNERS",
        "summary": "No CODEOWNERS file in standard locations",
        "description": (
            "Repositories without a CODEOWNERS file cannot use GitHub code-owner review rules. "
            "This is optional hygiene — SOC 2 change-management evidence uses branch protection and "
            "required PR approvals, not CODEOWNERS. Off by default."
        ),
        "default_enabled": False,
    },
]

OPTIONAL_CHECK_IDS = frozenset(c["check_id"] for c in OPTIONAL_CHECKS)
OPTIONAL_BY_ID = {c["check_id"]: c for c in OPTIONAL_CHECKS}
