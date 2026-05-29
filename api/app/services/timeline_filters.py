"""Curated vs operational CloudTrail events for Activity log UI."""
from __future__ import annotations

# Default Activity log: compliance-relevant infrastructure changes only.
COMPLIANCE_EVENT_SOURCES = frozenset(
    {
        "iam.amazonaws.com",
        "s3.amazonaws.com",
        "ec2.amazonaws.com",
        "kms.amazonaws.com",
        "cloudtrail.amazonaws.com",
        "config.amazonaws.com",
        "guardduty.amazonaws.com",
        "securityhub.amazonaws.com",
        "access-analyzer.amazonaws.com",
        "rds.amazonaws.com",
    }
)

OPERATIONAL_EVENT_SOURCES = frozenset(
    {
        "ssm.amazonaws.com",
        "lambda.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
        "secretsmanager.amazonaws.com",
        "dynamodb.amazonaws.com",
        "sns.amazonaws.com",
        "sqs.amazonaws.com",
    }
)


def is_compliance_timeline_event(event_source: str) -> bool:
    src = (event_source or "").lower()
    if not src:
        return False
    if src in COMPLIANCE_EVENT_SOURCES:
        return True
    if src in OPERATIONAL_EVENT_SOURCES:
        return False
    # Unknown sources: hide unless operational noise enabled
    return False
