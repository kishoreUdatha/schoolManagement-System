from datetime import date
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Gender
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Student(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True

    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "admission_no", name="uq_student_admission_per_school"
        ),
        UniqueConstraint(
            "section_id", "roll_no", "academic_year_id",
            name="uq_student_roll_per_section_year",
        ),
        Index("ix_students_school_id", "school_id"),
        Index("ix_students_tenant_id", "tenant_id"),
        Index("ix_students_section_id", "section_id"),
        Index("ix_students_academic_year_id", "academic_year_id"),
        Index("ix_students_full_name", "full_name"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    admission_no: Mapped[str] = mapped_column(String(40), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    dob: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[Gender]] = mapped_column(
        SAEnum(Gender, name="gender")
    )
    blood_group: Mapped[Optional[str]] = mapped_column(String(10))
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    address: Mapped[Optional[str]] = mapped_column(Text)

    # Current placement
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("academic_years.id", ondelete="RESTRICT"),
        nullable=False,
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sections.id", ondelete="RESTRICT"),
        nullable=False,
    )
    roll_no: Mapped[int] = mapped_column(Integer, nullable=False)

    # Optional User row for student login (parents handle this for now)
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
