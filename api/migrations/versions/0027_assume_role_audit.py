"""Add assume_role_audit table for STS call audit log.

Revision ID: 0027
Revises: 0026
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "assume_role_audit",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("aws_account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("role_arn", sa.String(700), nullable=True),
        sa.Column("session_name", sa.String(120), nullable=True),
        sa.Column("purpose", sa.String(80), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("error_code", sa.String(120), nullable=True),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("called_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_assume_role_audit_org_called_at",
        "assume_role_audit",
        ["org_id", "called_at"],
    )


def downgrade():
    op.drop_index("ix_assume_role_audit_org_called_at", table_name="assume_role_audit")
    op.drop_table("assume_role_audit")
