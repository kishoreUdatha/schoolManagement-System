"""Asking to hire, and settling somebody in once you have.

app/models/hr.py starts at the job opening — a post that already exists and
is being advertised. This holds the step before it, where somebody asks for
the post at all, and the step after the offer, where a new starter needs an
account, a desk and a morning of induction.
"""
from datetime import date as date_type, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import OnboardingArea, RequisitionStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    """Every row here belongs to one school, like everything else."""

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Requisition(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A request to hire somebody, and whether it was agreed.

    A job opening is a post being advertised; this is the argument for having
    the post. Keeping them apart means a refused request is still on record —
    which is the one a department head wants to point at next year, and
    exactly the one that disappears when the only artefact is the advert.

    The person who asks cannot be the person who agrees. That is the same
    rule attendance corrections use, for the same reason: a decision nobody
    else saw is not a decision, it is a preference.
    """

    __audited__ = True
    __tablename__ = "requisitions"
    __table_args__ = (
        Index("ix_requisitions_school_status", "school_id", "status"),
        Index("ix_requisitions_raised_by", "raised_by_user_id"),
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL")
    )
    role_description: Mapped[Optional[str]] = mapped_column(Text)
    headcount: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[RequisitionStatus] = mapped_column(
        SAEnum(RequisitionStatus, name="requisition_status"),
        nullable=False,
        default=RequisitionStatus.draft,
    )
    raised_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[Optional[str]] = mapped_column(String(300))
    needed_by: Mapped[Optional[date_type]] = mapped_column(Date)


class OnboardingTask(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One thing that has to happen before a new starter can get on with it.

    A checklist is created with the standard set already on it, rather than
    empty. An empty checklist and a finished one look identical a fortnight
    later, and "nobody set up their email" is indistinguishable from "they
    did not need one" unless somebody had to tick it either way.
    """

    __audited__ = True
    __tablename__ = "onboarding_tasks"
    __table_args__ = (
        Index("ix_onboarding_staff", "staff_id"),
        Index("ix_onboarding_school_done", "school_id", "is_done"),
    )

    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Its own enum rather than ClearanceArea: leaving is about handing things
    # back and owing nothing, arriving is about being given things. "finance"
    # on the way out means no outstanding advance; on the way in it means
    # payroll and a bank account. Sharing one list would make both vaguer.
    area: Mapped[OnboardingArea] = mapped_column(
        SAEnum(OnboardingArea, name="onboarding_area"), nullable=False
    )
    is_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    done_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    due_on: Mapped[Optional[date_type]] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(300))
