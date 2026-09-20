from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import OtpPurpose, UserRole
from app.database import Base
from app.models.base import PrimaryKeyMixin, SoftDeleteMixin, TimestampMixin


class User(Base, PrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __audited__ = True

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "phone", name="uq_user_tenant_phone"),
        UniqueConstraint("tenant_id", "email", name="uq_user_tenant_email"),
    )

    # tenant_id is NULL for super_admin (platform-level), required for everyone else
    tenant_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    school_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="SET NULL"), index=True
    )

    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))  # null when OTP-only

    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), nullable=False, index=True
    )

    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Set when the office hands over a password it has seen. Cleared the
    # moment the person chooses their own, so a password somebody else typed
    # never becomes the one they keep.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )


class UserOtp(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_otps"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # What the code is for. One table rather than two, because a one-time code
    # that expires and is used once is the same thing whether it is finishing a
    # login or starting a password reset — but a reset code must never be
    # accepted as a second factor, so the purpose is checked on the way in.
    purpose: Mapped[OtpPurpose] = mapped_column(
        SAEnum(OtpPurpose, name="otp_purpose"),
        nullable=False,
        server_default=OtpPurpose.login_2fa.value,
        default=OtpPurpose.login_2fa,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0", default=0)
