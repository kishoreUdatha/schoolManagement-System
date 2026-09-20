from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    NoticeAudience,
    NoticeStatus,
    RecipientStatus,
    NoticeChannel,
    NotificationCategory,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Notice(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True
    __tablename__ = "notices"
    __table_args__ = (
        Index("ix_notices_school_id", "school_id"),
        Index("ix_notices_tenant_id", "tenant_id"),
        Index("ix_notices_status", "school_id", "status"),
        Index("ix_notices_sent_at", "school_id", "sent_at"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    audience: Mapped[NoticeAudience] = mapped_column(
        SAEnum(NoticeAudience, name="notice_audience"), nullable=False
    )
    audience_class_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="SET NULL")
    )
    audience_section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="SET NULL")
    )
    audience_student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )

    # Channel choice: stored as JSON array of strings (e.g. ["in_app","email"])
    # What this is about. Without it a preference is decorative: the
    # sender has no way to tell a fee reminder from a sports-day notice,
    # so "mute events" could only ever mean "mute everything".
    category: Mapped[NotificationCategory] = mapped_column(
        SAEnum(NotificationCategory, name="notification_category"),
        nullable=False,
        server_default=NotificationCategory.general.value,
        default=NotificationCategory.general,
    )
    channels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    attachment_url: Mapped[Optional[str]] = mapped_column(String(500))
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    status: Mapped[NoticeStatus] = mapped_column(
        SAEnum(NoticeStatus, name="notice_status"),
        default=NoticeStatus.draft,
        nullable=False,
    )

    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class NoticeRecipient(Base, PrimaryKeyMixin, TimestampMixin):
    """One row per (notice, user, channel). Powers delivery report + parent inbox."""

    __tablename__ = "notice_recipients"
    __table_args__ = (
        Index("ix_notice_recipients_notice_id", "notice_id"),
        Index("ix_notice_recipients_user_id", "user_id"),
        Index("ix_notice_recipients_tenant_id", "tenant_id"),
        Index(
            "ix_notice_recipients_inbox",
            "user_id", "channel", "read_at",
        ),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    notice_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("notices.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    channel: Mapped[NoticeChannel] = mapped_column(
        SAEnum(NoticeChannel, name="notice_channel"), nullable=False
    )
    status: Mapped[RecipientStatus] = mapped_column(
        SAEnum(RecipientStatus, name="recipient_status"),
        default=RecipientStatus.queued,
        nullable=False,
    )
    error: Mapped[Optional[str]] = mapped_column(String(500))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
