from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ApprovalKind, ApprovalStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class ApprovalRequest(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 19.2 — Principal approval workflow.

    Generic store for changes that require principal sign-off:
      - marks_correction
      - attendance_edit
      - staff_leave
      - result_publishing

    The `payload` JSON holds whatever per-kind details the approver needs to
    decide and the apply-handler needs to mutate downstream records.
    """

    __audited__ = True
    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_tenant_id", "tenant_id"),
        Index("ix_approval_requests_school_id", "school_id"),
        Index(
            "ix_approval_requests_pending",
            "school_id",
            "status",
            "kind",
        ),
        Index("ix_approval_requests_requested_by", "requested_by_user_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    kind: Mapped[ApprovalKind] = mapped_column(
        SAEnum(ApprovalKind, name="approval_kind"), nullable=False
    )
    status: Mapped[ApprovalStatus] = mapped_column(
        SAEnum(ApprovalStatus, name="approval_status"),
        default=ApprovalStatus.pending,
        nullable=False,
    )

    requested_by_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[Optional[str]] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decision_remark: Mapped[Optional[str]] = mapped_column(Text)
    decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
