"""add inline_policies to iam_roles

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("iam_roles", sa.Column("inline_policies", postgresql.JSONB, server_default="{}"))


def downgrade() -> None:
    op.drop_column("iam_roles", "inline_policies")
