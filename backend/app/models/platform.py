"""Running the platform itself, rather than any one school.

Everything else in app/models belongs to a school and carries a school_id to
prove it. Nothing here does. A support ticket, a platform-wide announcement
and a global setting are the operator's records, not a tenant's, and scoping
them to a school would mean the operator could not see their own work.

SupportTicket carries a nullable tenant_id because a ticket has two origins:
a school reporting a problem, and the operator raising something internally.
Both belong in one queue — splitting them would mean the person working the
queue has two places to look.
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
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    AnnouncementAudience,
    TicketPriority,
    TicketStatus,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class SupportTicket(Base, PrimaryKeyMixin, TimestampMixin):
    """A problem somebody wants the operator to deal with."""

    __audited__ = True
    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_open", "status", "priority"),
        Index("ix_support_tickets_tenant", "tenant_id"),
    )

    # Null when the operator raised it themselves rather than a school.
    tenant_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE")
    )
    raised_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[TicketStatus] = mapped_column(
        SAEnum(TicketStatus, name="ticket_status"),
        nullable=False,
        default=TicketStatus.open,
    )
    priority: Mapped[TicketPriority] = mapped_column(
        SAEnum(TicketPriority, name="ticket_priority"),
        nullable=False,
        default=TicketPriority.normal,
    )
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    replies: Mapped[list["TicketReply"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )


class TicketReply(Base, PrimaryKeyMixin, TimestampMixin):
    """One message on a ticket.

    `is_internal` marks a note the school must never see — "this tenant is
    three months behind on payment", "known bug, waiting on the fix". The
    service filters on it rather than the frontend, because a note that is
    only hidden by a component is one API call away from being read.
    """

    __tablename__ = "ticket_replies"
    __table_args__ = (Index("ix_ticket_replies_ticket", "ticket_id"),)

    ticket_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    ticket: Mapped[SupportTicket] = relationship(back_populates="replies")


class GlobalAnnouncement(Base, PrimaryKeyMixin, TimestampMixin):
    """Something the operator wants every school to read.

    A window rather than a send: an announcement is live between its dates and
    stops on its own. Scheduling a message that has to be withdrawn by hand is
    how a maintenance notice is still on screen a fortnight later.
    """

    __audited__ = True
    __tablename__ = "global_announcements"
    __table_args__ = (Index("ix_announcements_window", "is_active", "starts_on", "ends_on"),)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[AnnouncementAudience] = mapped_column(
        SAEnum(AnnouncementAudience, name="announcement_audience"),
        nullable=False,
        default=AnnouncementAudience.all,
    )
    starts_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    # Null means it runs until somebody switches it off.
    ends_on: Mapped[Optional[date_type]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class PlatformSetting(Base, PrimaryKeyMixin, TimestampMixin):
    """One operator-level setting, keyed by name.

    A key/value table rather than columns, because these are the knobs an
    operator turns between releases — adding one should not need a migration.
    The value is JSONB so a setting can be a number, a flag or a small object
    without three nullable columns to say which.
    """

    __audited__ = True
    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    description: Mapped[Optional[str]] = mapped_column(String(300))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
