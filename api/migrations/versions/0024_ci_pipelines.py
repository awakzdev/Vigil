"""Add ci_pipelines table for GitLab CI/CD evidence.

Revision ID: 0024
Revises: 0023
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ci_pipelines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("repo_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("repos.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("pipeline_id", sa.BigInteger(), nullable=False),
        sa.Column("ref", sa.String(255), nullable=True),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("source", sa.String(60), nullable=True),
        sa.Column("actor", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("repo_id", "pipeline_id", name="uq_ci_pipeline_repo_pipeline"),
    )
    op.create_index("ix_ci_pipelines_repo_created",
                    "ci_pipelines", ["repo_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_ci_pipelines_repo_created", "ci_pipelines")
    op.drop_table("ci_pipelines")
