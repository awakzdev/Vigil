"""Encrypt role_arn and external_id at rest

Revision ID: 0008
Revises: 0007
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Widen columns to hold Fernet ciphertext (base64url-encoded).
    # role_arn plaintext ~200 chars → ciphertext ~380 chars
    # external_id plaintext ~32 chars → ciphertext ~120 chars
    op.alter_column("aws_accounts", "role_arn", type_=sa.String(700), existing_nullable=True)
    op.alter_column("aws_accounts", "external_id", type_=sa.String(200), existing_nullable=False)

    # Drop DB-level unique on external_id — Fernet is non-deterministic so the
    # same plaintext produces different ciphertexts; uniqueness is guaranteed
    # by secrets.token_urlsafe(24) entropy (collision prob ~2^-192).
    op.drop_constraint("aws_accounts_external_id_key", "aws_accounts", type_="unique")

    # Encrypt existing plaintext rows in-place.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, role_arn, external_id FROM aws_accounts")
    ).fetchall()

    if rows:
        from app.core.encryption import encrypt
        for row in rows:
            id_, role_arn, external_id = row
            new_role_arn = encrypt(role_arn) if role_arn else None
            new_ext = encrypt(external_id) if external_id else None
            bind.execute(
                sa.text(
                    "UPDATE aws_accounts SET role_arn = :r, external_id = :e WHERE id = :id"
                ),
                {"r": new_role_arn, "e": new_ext, "id": str(id_)},
            )


def downgrade() -> None:
    # Decrypt back to plaintext.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, role_arn, external_id FROM aws_accounts")
    ).fetchall()

    if rows:
        from app.core.encryption import decrypt
        for row in rows:
            id_, role_arn, external_id = row
            try:
                plain_role_arn = decrypt(role_arn) if role_arn else None
            except Exception:
                plain_role_arn = role_arn
            try:
                plain_ext = decrypt(external_id) if external_id else None
            except Exception:
                plain_ext = external_id
            bind.execute(
                sa.text(
                    "UPDATE aws_accounts SET role_arn = :r, external_id = :e WHERE id = :id"
                ),
                {"r": plain_role_arn, "e": plain_ext, "id": str(id_)},
            )

    op.alter_column("aws_accounts", "role_arn", type_=sa.String(400), existing_nullable=True)
    op.alter_column("aws_accounts", "external_id", type_=sa.String(64), existing_nullable=False)
    op.create_unique_constraint("aws_accounts_external_id_key", "aws_accounts", ["external_id"])
