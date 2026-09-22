"""A kept record of the platform health probe.

The health endpoint answers "is it up right now". Availability over a week,
or how long the database has been taking to answer, need the earlier answers
too, so each probe of a monitored service is written down here: when, what
state, and how long it took. One row per service per probe, sampled every
few minutes — a small series, pruned to the last 90 days.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class HealthSample(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_samples"
    __table_args__ = (
        Index("ix_health_samples_service_checked", "service", "checked_at"),
    )

    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    service: Mapped[str] = mapped_column(String(60), nullable=False)
    # up | down — only monitored services are sampled
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float)
