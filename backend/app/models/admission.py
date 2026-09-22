from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    AdmissionActivityKind,
    AdmissionSource,
    AdmissionStage,
    Gender,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class AdmissionCampaign(Base, PrimaryKeyMixin, TimestampMixin):
    """A marketing push (newspaper ad, open day, social campaign) that
    enquiries can be attributed to."""

    __tablename__ = "admission_campaigns"
    __table_args__ = (
        Index("ix_admission_campaigns_school_id", "school_id"),
        Index("ix_admission_campaigns_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    channel: Mapped[AdmissionSource] = mapped_column(
        SAEnum(AdmissionSource, name="admission_source"),
        default=AdmissionSource.campaign,
        nullable=False,
    )
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AdmissionEnquiry(Base, PrimaryKeyMixin, TimestampMixin):
    """A prospective student moving through the admission pipeline.

    `applying_for_class` is free text ("Grade 5") because classes are scoped
    to an academic year that may not exist yet when the enquiry comes in.
    Once enrolled, `student_id` points at the created Student.
    """

    __audited__ = True

    __tablename__ = "admission_enquiries"
    __table_args__ = (
        Index("ix_admission_enquiries_school_id", "school_id"),
        Index("ix_admission_enquiries_tenant_id", "tenant_id"),
        Index("ix_admission_enquiries_stage", "school_id", "stage"),
        Index("ix_admission_enquiries_follow_up", "school_id", "next_follow_up_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    student_name: Mapped[str] = mapped_column(String(160), nullable=False)
    dob: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[Gender]] = mapped_column(SAEnum(Gender, name="gender"))
    applying_for_class: Mapped[Optional[str]] = mapped_column(String(60))
    previous_school: Mapped[Optional[str]] = mapped_column(String(200))

    parent_name: Mapped[str] = mapped_column(String(160), nullable=False)
    parent_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_email: Mapped[Optional[str]] = mapped_column(String(255))
    address: Mapped[Optional[str]] = mapped_column(Text)

    source: Mapped[AdmissionSource] = mapped_column(
        SAEnum(AdmissionSource, name="admission_source"),
        default=AdmissionSource.walk_in,
        nullable=False,
    )
    campaign_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("admission_campaigns.id", ondelete="SET NULL")
    )
    # Which campus the family is asking about, when the school has more than one.
    branch_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("branches.id", ondelete="SET NULL")
    )
    stage: Mapped[AdmissionStage] = mapped_column(
        SAEnum(AdmissionStage, name="admission_stage"),
        default=AdmissionStage.enquiry,
        nullable=False,
    )
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    next_follow_up_date: Mapped[Optional[date]] = mapped_column(Date)
    lost_reason: Mapped[Optional[str]] = mapped_column(String(300))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    converted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class AdmissionActivity(Base, PrimaryKeyMixin, TimestampMixin):
    """Timeline entry on an enquiry: a call, a visit, a note, a stage move."""

    __tablename__ = "admission_activities"
    __table_args__ = (Index("ix_admission_activities_enquiry", "enquiry_id"),)

    enquiry_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("admission_enquiries.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    kind: Mapped[AdmissionActivityKind] = mapped_column(
        SAEnum(AdmissionActivityKind, name="admission_activity_kind"),
        nullable=False,
    )
    note: Mapped[Optional[str]] = mapped_column(Text)
    from_stage: Mapped[Optional[AdmissionStage]] = mapped_column(
        SAEnum(AdmissionStage, name="admission_stage")
    )
    to_stage: Mapped[Optional[AdmissionStage]] = mapped_column(
        SAEnum(AdmissionStage, name="admission_stage")
    )
