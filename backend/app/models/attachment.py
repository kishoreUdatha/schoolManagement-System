"""Files attached to a record: homework, a submission, a leave request…

One table for every kind of record, keyed (owner_type, owner_id). There is no
foreign key to the owner, so the service deletes a record's files when the
record goes. Who may read a file is decided by the record it belongs to: every
download goes through that record's own access check first.
"""
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Attachment(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "attachments"
    __table_args__ = (
        Index("ix_attachments_owner", "owner_type", "owner_id"),
        Index("ix_attachments_school_id", "school_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    # homework, homework_submission, homework_review, project, project_review,
    # student_leave, event, message — see attachment_service.KINDS
    owner_type: Mapped[str] = mapped_column(String(40), nullable=False)
    owner_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_key: Mapped[str] = mapped_column(String(300), nullable=False)
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
