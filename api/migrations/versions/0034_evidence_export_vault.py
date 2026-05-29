"""evidence_exports vault metadata"""

from alembic import op
import sqlalchemy as sa

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("evidence_exports", sa.Column("report_id", sa.String(32), nullable=True))
    op.add_column("evidence_exports", sa.Column("vault_s3_uri", sa.String(512), nullable=True))
    op.add_column("evidence_exports", sa.Column("vault_version_id", sa.String(128), nullable=True))
    op.add_column("evidence_exports", sa.Column("vault_object_lock_mode", sa.String(32), nullable=True))
    op.add_column(
        "evidence_exports",
        sa.Column("vault_retain_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_evidence_exports_report_id", "evidence_exports", ["report_id"])


def downgrade() -> None:
    op.drop_index("ix_evidence_exports_report_id", table_name="evidence_exports")
    op.drop_column("evidence_exports", "vault_retain_until")
    op.drop_column("evidence_exports", "vault_object_lock_mode")
    op.drop_column("evidence_exports", "vault_version_id")
    op.drop_column("evidence_exports", "vault_s3_uri")
    op.drop_column("evidence_exports", "report_id")
