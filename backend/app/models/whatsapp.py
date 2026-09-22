"""A school's own WhatsApp Business connection, and the approved message
templates it uses.

Each school connects its own number (Meta's WhatsApp Cloud API, or Twilio),
so messages go out under the school's name and are billed to its account.
WhatsApp only lets a business start a conversation with a template the
business has had approved, so every kind of message the system sends (an
absence alert, a fee reminder, a sign-in code…) is mapped to one of the
school's approved templates. Secrets are stored encrypted (app.core.crypto).
"""
from typing import Optional

from sqlalchemy import BigInteger, Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class SchoolWhatsappConfig(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "school_whatsapp_configs"
    __table_args__ = (UniqueConstraint("school_id", name="uq_whatsapp_config_school"),)

    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)

    # "meta" (WhatsApp Cloud API), "twilio", or "mock" (development only: nothing leaves the server)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    # The number people see messages come from, as the school knows it (+91…)
    sender_number: Mapped[str] = mapped_column(String(20), nullable=False)
    # Meta: phone number id and WhatsApp Business account id. Twilio: account SID.
    phone_number_id: Mapped[Optional[str]] = mapped_column(String(64))
    business_account_id: Mapped[Optional[str]] = mapped_column(String(64))
    account_sid: Mapped[Optional[str]] = mapped_column(String(64))
    # Meta: permanent access token. Twilio: auth token.
    token_enc: Mapped[Optional[str]] = mapped_column(Text)
    # Meta: app secret, to check that status callbacks really come from Meta.
    app_secret_enc: Mapped[Optional[str]] = mapped_column(Text)
    # Meta: the verify token the school types into Meta's webhook setup.
    verify_token: Mapped[Optional[str]] = mapped_column(String(64))
    # Country code added to local numbers without one (India: 91).
    default_country_code: Mapped[str] = mapped_column(String(4), default="91", server_default="91", nullable=False)
    # Kinds of automatic message (notification categories) sent on WhatsApp as
    # well as in the app: attendance, fees, exams, homework, events, general.
    auto_categories: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_error: Mapped[Optional[str]] = mapped_column(String(500))


class SchoolWhatsappTemplate(Base, PrimaryKeyMixin, TimestampMixin):
    """Which approved template carries which kind of message.

    `purpose` is a notification category (attendance, fees, exams, homework,
    events, general) or "otp" for sign-in and password codes. The template's
    body takes numbered parameters: for notices {{1}} is the title and {{2}}
    the message; for codes {{1}} is the code. For Twilio, `template_name` is
    the Content SID (HX…) of the approved template.
    """

    __tablename__ = "school_whatsapp_templates"
    __table_args__ = (UniqueConstraint("school_id", "purpose", name="uq_whatsapp_template_purpose"),)

    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    template_name: Mapped[str] = mapped_column(String(120), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", server_default="en", nullable=False)
