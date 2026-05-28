"""Check: AWS Config has non-compliant rules."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.checks.base import FindingDraft, score
from app.models.resources import ConfigRuleCompliance

CHECK_ID = "aws.config.rules_non_compliant"


def run(db: Session, account_id) -> list[FindingDraft]:
    count = db.scalar(
        select(func.count())
        .select_from(ConfigRuleCompliance)
        .where(
            ConfigRuleCompliance.account_id == account_id,
            ConfigRuleCompliance.compliance_type == "NON_COMPLIANT",
        )
    ) or 0
    if count == 0:
        return []
    sample = db.scalars(
        select(ConfigRuleCompliance)
        .where(
            ConfigRuleCompliance.account_id == account_id,
            ConfigRuleCompliance.compliance_type == "NON_COMPLIANT",
        )
        .limit(30)
    ).all()
    return [
        FindingDraft(
            check_id=CHECK_ID,
            resource_arn=f"arn:aws:config:::account/{account_id}/non-compliant",
            title=f"AWS Config reports {count} non-compliant rule(s)",
            severity="medium",
            risk_score=score("medium"),
            evidence={
                "non_compliant_rule_count": count,
                "sample_rules": [
                    {"region": r.region, "rule_name": r.rule_name}
                    for r in sample
                ],
            },
        )
    ]
