"""The platform's own WhatsApp and SMS accounts, and what was sent on them.

A school's WhatsApp (models.whatsapp) carries the school's messages to its
parents and staff. These are the platform team's accounts, for the messages
the platform itself sends before a school has anything connected: the new
school admin's sign-in details when a tenant is created, and again when the
super admin resends them. Secrets are stored encrypted (app.core.crypto).
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class PlatformMessagingChannel(Base, PrimaryKeyMixin, TimestampMixin):
    """One row per channel ("whatsapp", "sms").

    whatsapp  meta    phone number id in account_id, permanent token; template
                      = approved template name, body {{1}} name, {{2}}
                      organization, {{3}} username, {{4}} password, {{5}} sign-in link
              twilio  account SID in account_id, auth token; template = Content SID (HX…)
    sms       msg91   auth key as token, sender id; template = DLT flow template
                      id with ##var1##…##var5## in the same order
              twilio  account SID in account_id, auth token, sender = the Twilio number;
                      the text is sent as written
    mock (either)     development only: nothing leaves the server
    """

    __tablename__ = "platform_messaging_channels"

    channel: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    # WhatsApp: the number messages come from. SMS: the sender id or number.
    sender: Mapped[str] = mapped_column(String(40), nullable=False)
    account_id: Mapped[Optional[str]] = mapped_column(String(64))
    token_enc: Mapped[Optional[str]] = mapped_column(String(1000))
    template: Mapped[Optional[str]] = mapped_column(String(120))
    language: Mapped[str] = mapped_column(String(10), default="en", server_default="en", nullable=False)
    default_country_code: Mapped[str] = mapped_column(String(4), default="91", server_default="91", nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_error: Mapped[Optional[str]] = mapped_column(String(500))


class PlatformMessageLog(Base, PrimaryKeyMixin):
    """One message the platform sent (or tried to). Never holds the password."""

    __tablename__ = "platform_message_logs"

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)  # "login", "test"
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # "sent", "failed", "skipped"
    provider_message_id: Mapped[Optional[str]] = mapped_column(String(120))
    error: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
