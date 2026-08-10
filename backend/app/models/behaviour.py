from typing import Optional

from sqlalchemy import (
    BigInteger,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import BehaviourPeriodKind
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class BehaviourRating(Base, PrimaryKeyMixin, TimestampMixin):
    """One rating per (student, period_kind, period_key).

    period_key format:
      - weekly:  'YYYY-WNN' (ISO week, e.g. '2026-W23')
      - monthly: 'YYYY-MM'
    """

    __tablename__ = "behaviour_ratings"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "period_kind", "period_key",
            name="uq_behaviour_per_student_period",
        ),
        Index("ix_behaviour_school_id", "school_id"),
        Index("ix_behaviour_tenant_id", "tenant_id"),
        Index("ix_behaviour_student_id", "student_id"),
        Index("ix_behaviour_rated_by", "rated_by_user_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    rated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )

    period_kind: Mapped[BehaviourPeriodKind] = mapped_column(
        SAEnum(BehaviourPeriodKind, name="behaviour_period_kind"),
        nullable=False,
    )
    period_key: Mapped[str] = mapped_column(String(10), nullable=False)

    punctuality: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    participation: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    discipline: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    respect: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    teacher_note: Mapped[Optional[str]] = mapped_column(Text)
    # When AI was used, snapshot the suggestion for audit
    ai_suggested: Mapped[Optional[dict]] = mapped_column(JSONB)
