"""Add GitHub integration evidence tables.

Revision ID: 0018
Revises: 0017
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "identity_providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("config_json_encrypted", sa.String(4000), nullable=False),
        sa.Column("status", sa.String(40), nullable=False, server_default="connected"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("org_id", "type", name="uq_identity_provider_org_type"),
    )

    op.create_table(
        "identity_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity_providers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("external_id", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("name", sa.String(320), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("roles_json", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("provider_id", "external_id", name="uq_identity_user_provider_external"),
    )

    op.create_table(
        "repos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity_providers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("external_id", sa.String(120), nullable=False),
        sa.Column("name", sa.String(320), nullable=False),
        sa.Column("default_branch", sa.String(255), nullable=True),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("provider_id", "external_id", name="uq_repo_provider_external"),
    )

    op.create_table(
        "repo_protections",
        sa.Column("repo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repos.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("branch", sa.String(255), primary_key=True),
        sa.Column("required_reviews", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dismiss_stale", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("require_code_owners", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("allow_force_push", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("required_status_checks", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "pull_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("repos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("merged_by", sa.String(255), nullable=True),
        sa.Column("required_review_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approval_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("self_merge", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("repo_id", "number", name="uq_pull_request_repo_number"),
    )


def downgrade() -> None:
    op.drop_table("pull_requests")
    op.drop_table("repo_protections")
    op.drop_table("repos")
    op.drop_table("identity_users")
    op.drop_table("identity_providers")
