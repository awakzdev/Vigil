from app.checks import iam_access_key_unused, iam_user_inactive, iam_user_no_mfa

ALL_CHECKS = [iam_user_inactive, iam_access_key_unused, iam_user_no_mfa]
