"""IAM user attached and inline policy columns for CIS 1.16.

Revision ID: 0029
Revises: 0028
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "iam_users",
        sa.Column("attached_policies", JSONB, nullable=False, server_default="[]"),
    )
    op.add_column(
        "iam_users",
        sa.Column("inline_policies", JSONB, nullable=False, server_default="{}"),
    )


def downgrade():
    op.drop_column("iam_users", "inline_policies")
    op.drop_column("iam_users", "attached_policies")
