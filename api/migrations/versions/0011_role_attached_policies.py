"""role attached_policies column

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "iam_roles",
        sa.Column("attached_policies", JSONB, nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("iam_roles", "attached_policies")
