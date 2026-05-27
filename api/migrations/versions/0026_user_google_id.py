"""Add google_id to users for OAuth login.

Revision ID: 0026
Revises: 0025
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("google_id", sa.String(100), nullable=True))
    op.create_unique_constraint("uq_users_google_id", "users", ["google_id"])


def downgrade():
    op.drop_constraint("uq_users_google_id", "users", type_="unique")
    op.drop_column("users", "google_id")
