"""Add workflow_runs table for GitHub Actions evidence.

Revision ID: 0023
Revises: 0022
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repo_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("repos.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("run_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("workflow_path", sa.String(255), nullable=True),
        sa.Column("event", sa.String(60), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("conclusion", sa.String(40), nullable=True),
        sa.Column("branch", sa.String(255), nullable=True),
        sa.Column("actor", sa.String(255), nullable=True),
        sa.Column("environment", sa.String(255), nullable=True),
        sa.Column("run_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("repo_id", "run_id", name="uq_workflow_run_repo_run"),
    )
    op.create_index("ix_workflow_runs_repo_started",
                    "workflow_runs", ["repo_id", "run_started_at"])


def downgrade() -> None:
    op.drop_index("ix_workflow_runs_repo_started", "workflow_runs")
    op.drop_table("workflow_runs")
