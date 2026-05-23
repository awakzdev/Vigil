"""create iam_perm_usage table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # table exists in 0001_init on fresh DBs; only create if missing
    op.execute("""
        CREATE TABLE IF NOT EXISTS iam_perm_usage (
            id UUID NOT NULL PRIMARY KEY,
            account_id UUID NOT NULL REFERENCES aws_accounts(id) ON DELETE CASCADE,
            principal_arn VARCHAR(400) NOT NULL,
            service VARCHAR(100) NOT NULL,
            last_authenticated TIMESTAMP WITH TIME ZONE,
            CONSTRAINT uq_iam_perm_usage UNIQUE (account_id, principal_arn, service)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_perm_usage_account_id ON iam_perm_usage(account_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_perm_usage_principal_arn ON iam_perm_usage(principal_arn)")


def downgrade() -> None:
    op.drop_table("iam_perm_usage")
