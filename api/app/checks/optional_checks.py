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
        "check_id": "git.repo.no_codeowners",
        "label": "Git repo missing CODEOWNERS",
        "summary": "No CODEOWNERS file in standard locations",
        "description": (
            "Git repositories synced from GitHub or GitLab without a CODEOWNERS file cannot use "
            "code-owner review rules. Optional security check — SOC 2 change-management evidence uses "
            "branch protection and required merge request approvals, not CODEOWNERS alone. Off by default."
        ),
        "default_enabled": False,
    },
]

# Provider-specific finding check_ids toggled with the parent optional check (one UI switch).
OPTIONAL_LINKED: dict[str, list[str]] = {
    "git.repo.no_codeowners": ["github.repo.no_codeowners", "gitlab.repo.no_codeowners"],
}

# Legacy settings key before git.repo.no_codeowners unified the toggle.
OPTIONAL_SETTINGS_ALIASES: dict[str, str] = {
    "github.repo.no_codeowners": "git.repo.no_codeowners",
}

OPTIONAL_CHECK_IDS = frozenset(
    {c["check_id"] for c in OPTIONAL_CHECKS}
    | {lid for linked in OPTIONAL_LINKED.values() for lid in linked}
)
OPTIONAL_BY_ID = {c["check_id"]: c for c in OPTIONAL_CHECKS}

for _parent, _linked in OPTIONAL_LINKED.items():
    for _cid in _linked:
        OPTIONAL_BY_ID.setdefault(_cid, OPTIONAL_BY_ID[_parent])
