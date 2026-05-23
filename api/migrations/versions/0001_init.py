"""init schema

Revision ID: 0001_init
Revises:
Create Date: 2026-05-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orgs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("plan", sa.String(40), nullable=False, server_default="trial"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(40), nullable=False, server_default="owner"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "aws_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("account_id", sa.String(16)),
        sa.Column("role_arn", sa.String(400)),
        sa.Column("external_id", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="pending"),
        sa.Column("last_error", sa.String(1000)),
        sa.Column("last_scan_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_aws_accounts_org_id", "aws_accounts", ["org_id"])

    op.create_table(
        "scan_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(40), nullable=False, server_default="running"),
        sa.Column("stats", postgresql.JSONB, server_default="{}"),
        sa.Column("error", sa.String(2000)),
        sa.Column("findings_opened", sa.Integer, server_default="0"),
        sa.Column("findings_resolved", sa.Integer, server_default="0"),
    )
    op.create_index("ix_scan_runs_account_id", "scan_runs", ["account_id"])

    op.create_table(
        "iam_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("arn", sa.String(400), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True)),
        sa.Column("password_last_used", sa.DateTime(timezone=True)),
        sa.Column("has_console_password", sa.Boolean, server_default=sa.false()),
        sa.Column("mfa_enabled", sa.Boolean, server_default=sa.false()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("account_id", "arn"),
    )
    op.create_index("ix_iam_users_account_id", "iam_users", ["account_id"])
    op.create_index("ix_iam_users_arn", "iam_users", ["arn"])

    op.create_table(
        "iam_access_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_arn", sa.String(400), nullable=False),
        sa.Column("key_id", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True)),
        sa.Column("last_used", sa.DateTime(timezone=True)),
        sa.Column("last_used_service", sa.String(100)),
        sa.Column("last_used_region", sa.String(40)),
        sa.UniqueConstraint("account_id", "key_id"),
    )
    op.create_index("ix_iam_access_keys_account_id", "iam_access_keys", ["account_id"])
    op.create_index("ix_iam_access_keys_user_arn", "iam_access_keys", ["user_arn"])

    op.create_table(
        "iam_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("arn", sa.String(400), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True)),
        sa.Column("last_assumed", sa.DateTime(timezone=True)),
        sa.Column("trust_policy", postgresql.JSONB, server_default="{}"),
        sa.UniqueConstraint("account_id", "arn"),
    )
    op.create_index("ix_iam_roles_account_id", "iam_roles", ["account_id"])

    op.create_table(
        "iam_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("arn", sa.String(400), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("attachment_count", sa.Integer, server_default="0"),
        sa.Column("document", postgresql.JSONB, server_default="{}"),
        sa.UniqueConstraint("account_id", "arn"),
    )
    op.create_index("ix_iam_policies_account_id", "iam_policies", ["account_id"])

    op.create_table(
        "iam_perm_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("principal_arn", sa.String(400), nullable=False),
        sa.Column("service", sa.String(100), nullable=False),
        sa.Column("last_authenticated", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("account_id", "principal_arn", "service"),
    )
    op.create_index("ix_iam_perm_usage_account_id", "iam_perm_usage", ["account_id"])
    op.create_index("ix_iam_perm_usage_principal_arn", "iam_perm_usage", ["principal_arn"])

    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_id", sa.String(120), nullable=False),
        sa.Column("resource_arn", sa.String(400), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("risk_score", sa.Integer, server_default="0"),
        sa.Column("evidence", postgresql.JSONB, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("snooze_until", sa.DateTime(timezone=True)),
        sa.Column("first_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("account_id", "check_id", "resource_arn"),
    )
    op.create_index("ix_findings_org_id", "findings", ["org_id"])
    op.create_index("ix_findings_account_id", "findings", ["account_id"])
    op.create_index("ix_findings_check_id", "findings", ["check_id"])
    op.create_index("ix_findings_status", "findings", ["status"])

    op.create_table(
        "finding_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("finding_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actor", sa.String(200), server_default="system"),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("note", sa.String(2000)),
    )
    op.create_index("ix_finding_events_finding_id", "finding_events", ["finding_id"])


def downgrade() -> None:
    for t in [
        "finding_events", "findings",
        "iam_perm_usage", "iam_policies", "iam_roles",
        "iam_access_keys", "iam_users",
        "scan_runs", "aws_accounts",
        "users", "orgs",
    ]:
        op.drop_table(t)
