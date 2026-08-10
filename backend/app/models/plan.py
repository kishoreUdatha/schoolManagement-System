from typing import Optional

from sqlalchemy import BigInteger, Boolean, Enum as SAEnum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ModuleKey, PlanTier
from app.database import Base
from app.models.base import PrimaryKeyMixin, SoftDeleteMixin, TimestampMixin


class Plan(Base, PrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    tier: Mapped[PlanTier] = mapped_column(
        SAEnum(PlanTier, name="plan_tier"), default=PlanTier.basic, nullable=False
    )
    description: Mapped[Optional[str]] = mapped_column(String(500))

    price_monthly: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    price_yearly: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    student_limit: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    staff_limit: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    storage_mb_limit: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    sms_quota: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    whatsapp_quota: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    email_quota: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    modules: Mapped[list["PlanModule"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PlanModule(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_modules"
    __table_args__ = (UniqueConstraint("plan_id", "module_key", name="uq_plan_module"),)

    plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module_key: Mapped[ModuleKey] = mapped_column(
        SAEnum(ModuleKey, name="module_key"), nullable=False
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    plan: Mapped[Plan] = relationship(back_populates="modules")
