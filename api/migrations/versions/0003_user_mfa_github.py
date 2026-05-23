"""add totp and github_id to users

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("github_id", sa.String(100), nullable=True))
    op.create_unique_constraint("uq_users_github_id", "users", ["github_id"])
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"))


def downgrade():
    op.drop_constraint("uq_users_github_id", "users", type_="unique")
    op.drop_column("users", "github_id")
    op.drop_column("users", "totp_secret")
    op.drop_column("users", "totp_enabled")
