"""account governance + IAM server certificates for CIS 1.1/1.2/1.18"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_governance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("primary_contact_complete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("security_contact_complete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("collection_error", sa.String(500), nullable=True),
        sa.Column("contact_snapshot", JSON, nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_account_governance_account_id", "account_governance", ["account_id"], unique=True)

    op.create_table(
        "iam_server_certificates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("arn", sa.String(512), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("account_id", "arn", name="uq_iam_server_cert_account_arn"),
    )
    op.create_index("ix_iam_server_certificates_account_id", "iam_server_certificates", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_iam_server_certificates_account_id", table_name="iam_server_certificates")
    op.drop_table("iam_server_certificates")
    op.drop_index("ix_account_governance_account_id", table_name="account_governance")
    op.drop_table("account_governance")
