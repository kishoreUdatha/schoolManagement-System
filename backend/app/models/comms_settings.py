"""What a school sends, how it sends it, and how hard it is to get in.

Three separate ideas that all live in Settings: which messages a person is
willing to receive, the wording the school reuses, and the rules a password
has to satisfy.

The security policy is one row per school rather than a bag of key/value
settings, because these rules are read on every sign-in and on every password
change — a shape the database can answer in one lookup is worth more here
than a general-purpose settings table.
"""
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import NoticeChannel, NotificationCategory, TwoFactorScope
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    """Every row here belongs to one school, like everything else."""

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class NotificationPreference(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One person's answer to "send me this kind of message on this channel".

    Rows only exist where somebody has said no. An absent row means yes, which
    is the only safe default: opt-in preferences mean a school switches on SMS,
    nobody has ticked anything, and the messages go nowhere while everyone
    believes they were sent.

    Not every combination is a choice. A parent cannot mute attendance or fees
    (see comms_settings_service.LOCKED), and cannot mute the in-app channel at
    all — that one is the record rather than a push, and silencing it would
    leave the message with nowhere to exist.
    """

    __audited__ = True
    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "channel", "category", name="uq_preference_per_user_channel"
        ),
        Index("ix_preferences_user", "user_id"),
        Index("ix_preferences_school", "school_id"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[NoticeChannel] = mapped_column(
        SAEnum(NoticeChannel, name="notice_channel"), nullable=False
    )
    category: Mapped[NotificationCategory] = mapped_column(
        SAEnum(NotificationCategory, name="notification_category"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class NotificationTemplate(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Wording the school reuses, with the same {placeholder} braces the
    certificate templates already use — one convention for substitution is
    worth more than a better second one."""

    __audited__ = True
    __tablename__ = "notification_templates"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_template_code_per_school"),
        Index("ix_templates_school", "school_id"),
    )

    code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    channel: Mapped[NoticeChannel] = mapped_column(
        SAEnum(NoticeChannel, name="notice_channel"), nullable=False
    )
    category: Mapped[NotificationCategory] = mapped_column(
        SAEnum(NotificationCategory, name="notification_category"),
        nullable=False,
        default=NotificationCategory.general,
    )
    subject: Mapped[Optional[str]] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SecurityPolicy(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """How hard a password has to be, and who needs a second factor.

    One row per school. Every field here is read by something that enforces
    it — a policy screen describing rules nothing checks is worse than no
    screen, because it tells an administrator the school is protected when it
    is not.
    """

    __audited__ = True
    __tablename__ = "security_policies"
    __table_args__ = (
        UniqueConstraint("school_id", name="uq_security_policy_per_school"),
    )

    min_password_length: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="8", default=8
    )
    require_mixed_case: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    require_number: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    require_symbol: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    # Nullable throughout: null means "no rule", which is different from zero.
    password_expiry_days: Mapped[Optional[int]] = mapped_column(SmallInteger)
    max_failed_attempts: Mapped[Optional[int]] = mapped_column(SmallInteger)
    lockout_minutes: Mapped[Optional[int]] = mapped_column(SmallInteger)
    session_timeout_minutes: Mapped[Optional[int]] = mapped_column(SmallInteger)

    require_2fa_for: Mapped[TwoFactorScope] = mapped_column(
        SAEnum(TwoFactorScope, name="two_factor_scope"),
        nullable=False,
        server_default=TwoFactorScope.nobody.value,
        default=TwoFactorScope.nobody,
    )
