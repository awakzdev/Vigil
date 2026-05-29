"""security_groups.public_exposure JSON for ingress rule evidence."""
from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "security_groups",
        sa.Column("public_exposure", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("security_groups", "public_exposure")
