from typing import Optional

from sqlalchemy import (
    BigInteger,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AuditAction
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class AuditLog(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 22.1 — immutable trail of create/update/delete on critical entities.

    `old_values` and `new_values` are JSON snapshots of the changed columns
    (NOT the whole row) so the diff is compact and human-readable.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_tenant_id", "tenant_id"),
        Index("ix_audit_logs_school_id", "school_id"),
        Index("ix_audit_logs_school_created", "school_id", "created_at"),
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_user_id", "user_id"),
    )

    tenant_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="SET NULL")
    )
    school_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="SET NULL")
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )

    action: Mapped[AuditAction] = mapped_column(
        SAEnum(AuditAction, name="audit_action"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[Optional[int]] = mapped_column(BigInteger)

    # Snapshot of changed columns only (smaller payloads, easier to scan)
    old_values: Mapped[Optional[dict]] = mapped_column(JSONB)
    new_values: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Helpful breadcrumb for cross-correlating with API logs
    request_path: Mapped[Optional[str]] = mapped_column(String(255))
    # "success" for a change that was saved; "failed" for a change a signed-in
    # user attempted and the server refused (permission, conflict, bad input).
    result: Mapped[str] = mapped_column(String(20), default="success", server_default="success", nullable=False)
