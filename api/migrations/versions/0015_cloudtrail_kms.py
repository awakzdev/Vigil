"""Add CloudTrail KMS key tracking.

Revision ID: 0015
Revises: 0014
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cloudtrail_trails", sa.Column("kms_key_id", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("cloudtrail_trails", "kms_key_id")
