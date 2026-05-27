"""Add gitlab_id to users for OAuth login.

Revision ID: 0025
Revises: 0024
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("gitlab_id", sa.String(100), nullable=True))
    op.create_unique_constraint("uq_users_gitlab_id", "users", ["gitlab_id"])


def downgrade():
    op.drop_constraint("uq_users_gitlab_id", "users", type_="unique")
    op.drop_column("users", "gitlab_id")
