"""Bulk imports, saved report definitions and the exports they produce."""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ExportStatus, ImportStatus, ImportType, ReportSource
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class ImportJob(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One uploaded spreadsheet. It is always checked before anything is
    written, so the office can see the bad rows and fix them first."""

    __audited__ = True
    __tablename__ = "import_jobs"
    __table_args__ = (Index("ix_import_jobs_school", "school_id", "created_at"),)

    import_type: Mapped[ImportType] = mapped_column(SAEnum(ImportType, name="import_type"), nullable=False)
    status: Mapped[ImportStatus] = mapped_column(
        SAEnum(ImportStatus, name="import_status"), default=ImportStatus.uploaded, nullable=False
    )
    file_key: Mapped[str] = mapped_column(String(300), nullable=False)
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # where the rows should land (section for students, exam for marks, …)
    options: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors: Mapped[list[Any]] = mapped_column(JSONB, default=list, nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class ReportDefinition(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A saved report: a source, the filters to apply and the columns to show."""

    __audited__ = True
    __tablename__ = "report_definitions"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_report_definition_code"),
        Index("ix_report_definitions_school", "school_id", "is_active"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    source: Mapped[ReportSource] = mapped_column(SAEnum(ReportSource, name="report_source"), nullable=False)
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    columns: Mapped[list[Any]] = mapped_column(JSONB, default=list, nullable=False)
    sort_by: Mapped[Optional[str]] = mapped_column(String(60))
    # Rows come out grouped by this column (with a count per group).
    group_by: Mapped[Optional[str]] = mapped_column(String(60))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class ExportJob(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A file produced by running a report, kept so it can be downloaded again."""

    __tablename__ = "export_jobs"
    __table_args__ = (Index("ix_export_jobs_school", "school_id", "created_at"),)

    report_definition_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("report_definitions.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[ExportStatus] = mapped_column(
        SAEnum(ExportStatus, name="export_status"), default=ExportStatus.running, nullable=False
    )
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    file_key: Mapped[Optional[str]] = mapped_column(String(300))
    file_name: Mapped[Optional[str]] = mapped_column(String(200))
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    message: Mapped[Optional[str]] = mapped_column(Text)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
