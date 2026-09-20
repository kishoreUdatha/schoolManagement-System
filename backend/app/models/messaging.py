from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Conversation(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 17.2 — Threaded chat between a parent and a teacher, scoped to
    one student (so all messages about a child stay together)."""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint(
            "parent_user_id", "teacher_user_id", "student_id",
            name="uq_conversation_per_triple",
        ),
        Index("ix_conversations_school_id", "school_id"),
        Index("ix_conversations_tenant_id", "tenant_id"),
        Index("ix_conversations_parent", "parent_user_id"),
        Index("ix_conversations_teacher", "teacher_user_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    teacher_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )

    last_message_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    parent_unread: Mapped[int] = mapped_column(default=0, nullable=False)
    teacher_unread: Mapped[int] = mapped_column(default=0, nullable=False)
    # a settled conversation the teacher has put away; a new message reopens it
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Message(Base, PrimaryKeyMixin, TimestampMixin):
    """One message within a Conversation."""

    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_id", "conversation_id"),
        Index("ix_messages_tenant_id", "tenant_id"),
        Index("ix_messages_school_id", "school_id"),
        Index("ix_messages_sender", "sender_user_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    body: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_url: Mapped[Optional[str]] = mapped_column(Text)
    is_read_by_recipient: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
