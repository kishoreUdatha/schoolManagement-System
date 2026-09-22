from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class AcademicYear(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "academic_years"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_academic_year_name_per_school"),
        Index("ix_academic_years_school_id", "school_id"),
        Index("ix_academic_years_tenant_id", "tenant_id"),
        Index("ix_academic_years_is_current", "school_id", "is_current"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(40), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Whether the school is taking admissions for this year, and from when
    admissions_open: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    admission_opens_on: Mapped[Optional[date]] = mapped_column(Date)


class SchoolClass(Base, PrimaryKeyMixin, TimestampMixin):
    """A class within a school, scoped to one academic year (e.g. 'Grade 5' in 2026-27)."""

    __tablename__ = "school_classes"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "academic_year_id", "name", name="uq_class_name_per_year"
        ),
        Index("ix_school_classes_school_id", "school_id"),
        Index("ix_school_classes_tenant_id", "tenant_id"),
        Index(
            "ix_school_classes_year_order", "academic_year_id", "display_order"
        ),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("academic_years.id", ondelete="RESTRICT"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(60), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    code: Mapped[Optional[str]] = mapped_column(String(20))
    # Pre-primary / Primary / Middle school / Secondary / Senior secondary
    school_level: Mapped[Optional[str]] = mapped_column(String(40))
    # Planned intake for the whole class; sections carry their own capacity
    capacity: Mapped[Optional[int]] = mapped_column(Integer)
    coordinator_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )

    coordinator: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", foreign_keys=[coordinator_user_id], viewonly=True
    )

    @property
    def coordinator_name(self) -> Optional[str]:
        return self.coordinator.full_name if self.coordinator else None

    sections: Mapped[list["Section"]] = relationship(
        back_populates="school_class",
        cascade="all, delete-orphan",
        order_by="Section.name",
    )


class Section(Base, PrimaryKeyMixin, TimestampMixin):
    """A section within a class (e.g. 'A', 'B'). Holds capacity + optional class teacher."""

    __tablename__ = "sections"
    __table_args__ = (
        UniqueConstraint("class_id", "name", name="uq_section_name_per_class"),
        Index("ix_sections_class_id", "class_id"),
        Index("ix_sections_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("school_classes.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(20), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    branch_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("branches.id", ondelete="SET NULL")
    )
    # Set later in Story 2.5 once teacher accounts exist
    class_teacher_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # Story 2.8 — null when timetable is in draft / hidden from parents+teachers
    timetable_published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    school_class: Mapped[SchoolClass] = relationship(back_populates="sections")

    # The room this section normally sits in: rooms.section_id points here.
    room: Mapped[Optional["Room"]] = relationship(  # noqa: F821
        "Room", primaryjoin="Room.section_id == Section.id", foreign_keys="Room.section_id",
        viewonly=True, uselist=False,
    )

    @property
    def room_id(self) -> Optional[int]:
        return self.room.id if self.room else None

    @property
    def room_name(self) -> Optional[str]:
        return self.room.name if self.room else None
