"""Add cloudtrail_events table for significant write events.

Revision ID: 0021
Revises: 0020
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cloudtrail_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("event_id", sa.String(64), nullable=False),
        sa.Column("event_name", sa.String(120), nullable=False),
        sa.Column("event_source", sa.String(120), nullable=False),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(320), nullable=True),
        sa.Column("source_ip", sa.String(64), nullable=True),
        sa.Column("resources", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("raw", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("last_seen", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("account_id", "event_id", name="uq_cloudtrail_event_account_id"),
    )
    op.create_index("ix_cloudtrail_events_event_time", "cloudtrail_events",
                    ["account_id", "event_time"])


def downgrade() -> None:
    op.drop_index("ix_cloudtrail_events_event_time", "cloudtrail_events")
    op.drop_table("cloudtrail_events")
