from app.checks import (
    access_key_multiple_active,
    access_key_no_rotation,
    cloudtrail_not_enabled,
    cloudtrail_no_log_validation,
    guardduty_not_enabled,
    iam_access_key_unused,
    iam_root_access_keys,
    iam_root_no_mfa,
    iam_user_inactive,
    iam_user_no_mfa,
    kms_no_rotation,
    rds_no_encryption,
    rds_publicly_accessible,
    role_trust_wildcard,
    role_unassumed_90d,
    role_unused_services,
    role_wildcard_action,
    s3_no_https_policy,
    s3_no_kms,
    s3_no_logging,
    s3_public_access,
    sg_unrestricted_rdp,
    sg_unrestricted_ssh,
    vpc_no_flow_logs,
)

ALL_CHECKS = [
    # root (critical — run first)
    iam_root_access_keys,
    iam_root_no_mfa,
    # IAM users
    iam_user_inactive,
    iam_access_key_unused,
    access_key_no_rotation,
    access_key_multiple_active,
    iam_user_no_mfa,
    # IAM roles
    role_unassumed_90d,
    role_wildcard_action,
    role_unused_services,
    role_trust_wildcard,
    # S3
    s3_public_access,
    s3_no_https_policy,
    s3_no_kms,
    s3_no_logging,
    # KMS
    kms_no_rotation,
    # CloudTrail
    cloudtrail_not_enabled,
    cloudtrail_no_log_validation,
    # GuardDuty
    guardduty_not_enabled,
    # VPC
    vpc_no_flow_logs,
    # EC2 Security Groups
    sg_unrestricted_ssh,
    sg_unrestricted_rdp,
    # RDS
    rds_publicly_accessible,
    rds_no_encryption,
]
