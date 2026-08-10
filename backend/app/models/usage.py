from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class TenantUsage(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_usage"
    __table_args__ = (
        UniqueConstraint("tenant_id", "metric_date", name="uq_tenant_usage_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    students_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    staff_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    parents_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    active_users_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    sms_sent: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    whatsapp_sent: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    email_sent: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    storage_used_mb: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
