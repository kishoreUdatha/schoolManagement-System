"""The front office's post and courier register (services/front_office_service.py)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class PostItem(Base, PrimaryKeyMixin, TimestampMixin):
    """A letter, parcel or document that came in or went out at reception."""

    __audited__ = True
    __tablename__ = "front_office_post"
    __table_args__ = (Index("ix_front_office_post_school", "school_id", "logged_at"),)

    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    direction: Mapped[str] = mapped_column(String(3), nullable=False)  # in | out
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="letter")  # letter | parcel | document
    party: Mapped[str] = mapped_column(String(160), nullable=False)  # who sent it (in) / who it goes to (out)
    for_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    for_text: Mapped[Optional[str]] = mapped_column(String(160))  # a department, a student, anyone not on staff
    courier: Mapped[Optional[str]] = mapped_column(String(80))
    tracking_no: Mapped[Optional[str]] = mapped_column(String(80))
    note: Mapped[Optional[str]] = mapped_column(String(300))
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    logged_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    handed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # collected (in) / sent (out)
    handed_to: Mapped[Optional[str]] = mapped_column(String(120))
    handed_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
