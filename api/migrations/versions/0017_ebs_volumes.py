"""Add EBS volumes.

Revision ID: 0017
Revises: 0016
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ebs_volumes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("region", sa.String(40), nullable=False),
        sa.Column("volume_id", sa.String(64), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("encrypted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("state", sa.String(40), nullable=False, server_default="unknown"),
        sa.Column("size_gib", sa.Integer(), nullable=True),
        sa.Column("volume_type", sa.String(40), nullable=True),
        sa.Column("attached_instance_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("account_id", "region", "volume_id"),
    )


def downgrade() -> None:
    op.drop_table("ebs_volumes")
