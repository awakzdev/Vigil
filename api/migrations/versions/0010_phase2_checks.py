"""phase2 checks: cloudtrail, guardduty, vpc, security_groups, rds_instances

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cloudtrail_trails",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("home_region", sa.String(40), nullable=False),
        sa.Column("is_multi_region", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_logging", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("log_validation_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "arn"),
    )

    op.create_table(
        "guardduty_detectors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("detector_id", sa.String(64), nullable=False),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "detector_id", "region"),
    )

    op.create_table(
        "vpcs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("vpc_id", sa.String(64), nullable=False),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("flow_logs_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "vpc_id", "region"),
    )

    op.create_table(
        "security_groups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("group_id", sa.String(64), nullable=False),
        sa.Column("group_name", sa.String(256), nullable=False),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("unrestricted_ssh", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("unrestricted_rdp", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "group_id", "region"),
    )

    op.create_table(
        "rds_instances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("db_instance_id", sa.String(256), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("publicly_accessible", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("storage_encrypted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("engine", sa.String(64), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "arn"),
    )


def downgrade() -> None:
    op.drop_table("rds_instances")
    op.drop_table("security_groups")
    op.drop_table("vpcs")
    op.drop_table("guardduty_detectors")
    op.drop_table("cloudtrail_trails")
