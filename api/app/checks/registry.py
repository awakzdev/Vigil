from app.checks import iam_access_key_unused, iam_user_inactive, iam_user_no_mfa, role_unassumed_90d, role_wildcard_action, role_unused_services

ALL_CHECKS = [iam_user_inactive, iam_access_key_unused, iam_user_no_mfa, role_unassumed_90d, role_wildcard_action, role_unused_services]
