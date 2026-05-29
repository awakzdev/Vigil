import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EvidenceExport(Base):
    """Recorded evidence pack downloads for re-download / audit trail."""

    __tablename__ = "evidence_exports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False
    )
    framework: Mapped[str] = mapped_column(String(32), nullable=False)
    period_days: Mapped[int] = mapped_column(Integer, nullable=False)
    as_of: Mapped[date | None] = mapped_column(Date, nullable=True)
    zip_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    report_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    vault_s3_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    vault_version_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vault_object_lock_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    vault_retain_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
