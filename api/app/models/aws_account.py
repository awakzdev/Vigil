import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, DateTime, func, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.encryption import EncryptedString


class AwsAccount(Base):
    __tablename__ = "aws_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(120))
    account_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    role_arn: Mapped[str | None] = mapped_column(EncryptedString(700), nullable=True)
    external_id: Mapped[str] = mapped_column(EncryptedString(200))
    status: Mapped[str] = mapped_column(String(40), default="pending")  # pending|connected|error
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    last_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ScanRun(Base):
    __tablename__ = "scan_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("aws_accounts.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="running")  # running|ok|error
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    findings_opened: Mapped[int] = mapped_column(Integer, default=0)
    findings_resolved: Mapped[int] = mapped_column(Integer, default=0)
