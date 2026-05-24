from app.checks import (
    access_key_multiple_active,
    access_key_no_rotation,
    iam_access_key_unused,
    iam_user_inactive,
    iam_user_no_mfa,
    role_trust_wildcard,
    role_unassumed_90d,
    role_unused_services,
    role_wildcard_action,
)

ALL_CHECKS = [
    iam_user_inactive,
    iam_access_key_unused,
    access_key_no_rotation,
    access_key_multiple_active,
    iam_user_no_mfa,
    role_unassumed_90d,
    role_wildcard_action,
    role_unused_services,
    role_trust_wildcard,
]
