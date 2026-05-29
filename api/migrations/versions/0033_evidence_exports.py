"""evidence pack export history"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidence_exports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("framework", sa.String(32), nullable=False),
        sa.Column("period_days", sa.Integer(), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=True),
        sa.Column("zip_sha256", sa.String(64), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_evidence_exports_account_id", "evidence_exports", ["account_id"])
    op.create_index("ix_evidence_exports_created_at", "evidence_exports", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_evidence_exports_created_at", table_name="evidence_exports")
    op.drop_index("ix_evidence_exports_account_id", table_name="evidence_exports")
    op.drop_table("evidence_exports")
