"""remediation execution records (dispatch + Lambda webhook)."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "remediation_executions",
        sa.Column("plan_id", sa.String(64), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("finding_id", UUID(as_uuid=True), sa.ForeignKey("findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_id", sa.String(120), nullable=False),
        sa.Column("plan_json", JSONB, nullable=False, server_default="{}"),
        sa.Column("content_sha256", sa.String(64), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="dispatched"),
        sa.Column("result_json", JSONB, nullable=True),
        sa.Column("error", sa.String(2000), nullable=True),
    )
    op.create_index("ix_remediation_executions_finding_id", "remediation_executions", ["finding_id"])
    op.create_index("ix_remediation_executions_account_id", "remediation_executions", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_remediation_executions_account_id", table_name="remediation_executions")
    op.drop_index("ix_remediation_executions_finding_id", table_name="remediation_executions")
    op.drop_table("remediation_executions")
