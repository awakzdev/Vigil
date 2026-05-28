"""GuardDuty findings, Identity Center users, Config rule compliance, AMI created_at."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "guardduty_findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("finding_id", sa.String(64), nullable=False),
        sa.Column("finding_type", sa.String(256), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("resource_arn", sa.String(512), nullable=True),
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "region", "finding_id", name="uq_guardduty_finding"),
    )
    op.create_index("ix_guardduty_findings_account", "guardduty_findings", ["account_id"])

    op.create_table(
        "identity_center_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("identity_store_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("user_name", sa.String(256), nullable=True),
        sa.Column("display_name", sa.String(256), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "identity_store_id", "user_id", name="uq_identity_center_user"),
    )
    op.create_index("ix_identity_center_users_account", "identity_center_users", ["account_id"])

    op.create_table(
        "config_rule_compliance",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("rule_name", sa.String(256), nullable=False),
        sa.Column("compliance_type", sa.String(40), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "region", "rule_name", name="uq_config_rule_compliance"),
    )
    op.create_index("ix_config_rule_compliance_account", "config_rule_compliance", ["account_id"])

    op.add_column("ec2_amis", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("ec2_amis", "created_at")
    op.drop_table("config_rule_compliance")
    op.drop_table("identity_center_users")
    op.drop_table("guardduty_findings")
