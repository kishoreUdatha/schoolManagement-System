"""Parent services: what a parent asks the school for, and what the school
publishes back to parents.

- ParentRequest: one table for the parent's requests that the school has to
  approve — link a child, change my contact details, change transport, renew a
  library book. The kind decides who approves it and what approving does.
- ParentServiceSettings: when the school answers messages and when the office
  help desk is open (one row per school).
- HelpTicket / HelpTicketReply: the school office's help desk for parents.
- Survey / SurveyResponse: feedback surveys the school sends to parents.
- StudentAchievement: achievements and milestones (a reading target, a prize).
- ProjectMilestone: dated checkpoints on a project.
- CanteenMenu: the day-school menu (hostels keep their own mess menu).

Kinds and statuses are short strings checked by the service rather than
Postgres enums, so adding a kind later needs no migration.
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class ParentRequest(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A parent's request the school approves or rejects.

    kind: link_child | contact_change | transport_change | library_renewal
    status: pending | approved | rejected | cancelled
    details: what was asked for (admission number and date of birth, the new
    mobile, the stop and date, the loan) — its shape depends on the kind.
    """

    __audited__ = True
    __tablename__ = "parent_requests"
    __table_args__ = (
        Index("ix_parent_requests_school_kind", "school_id", "kind", "status"),
        Index("ix_parent_requests_parent", "parent_user_id"),
    )

    parent_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Null for requests that are not about one child (contact details, and a
    # link request until the school matches the child).
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[Optional[str]] = mapped_column(String(500))
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[Optional[str]] = mapped_column(String(500))


class ParentServiceSettings(Base, _School, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "parent_service_settings"
    __table_args__ = (UniqueConstraint("school_id", name="uq_parent_service_settings_school"),)

    # Free text, as the school would say it: "Mon–Fri, 8:00 am – 4:00 pm".
    communication_hours: Mapped[Optional[str]] = mapped_column(String(200))
    office_hours: Mapped[Optional[str]] = mapped_column(String(200))
    office_phone: Mapped[Optional[str]] = mapped_column(String(20))
    office_email: Mapped[Optional[str]] = mapped_column(String(255))
    help_desk_note: Mapped[Optional[str]] = mapped_column(String(300))


class HelpTicket(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A parent's question to the school office. status: open | in_progress | resolved."""

    __tablename__ = "help_tickets"
    __table_args__ = (
        Index("ix_help_tickets_school_status", "school_id", "status"),
        Index("ix_help_tickets_parent", "parent_user_id"),
    )

    parent_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    subject: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    parent_unread: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class HelpTicketReply(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "help_ticket_replies"
    __table_args__ = (Index("ix_help_ticket_replies_ticket", "ticket_id"),)

    ticket_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("help_tickets.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)


class Survey(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A feedback survey for parents.

    audience: all (every parent) | class (parents of children in class_id)
    status: draft | open | closed
    questions: [{"id": "q1", "text": "...", "kind": "rating" | "choice" | "text",
                 "options": [...], "required": true}]
    """

    __tablename__ = "surveys"
    __table_args__ = (Index("ix_surveys_school_status", "school_id", "status"),)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    audience: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    class_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="SET NULL")
    )
    questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    closes_on: Mapped[Optional[date]] = mapped_column(Date)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class SurveyResponse(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "survey_responses"
    __table_args__ = (
        UniqueConstraint("survey_id", "parent_user_id", name="uq_survey_response_per_parent"),
        Index("ix_survey_responses_survey", "survey_id"),
    )

    survey_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class StudentAchievement(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """An achievement or a milestone towards a target.

    A milestone has a target ("read 10 books"): target_value and current_value
    in `unit`, status in_progress until reached. An achievement is simply
    status achieved with the date.
    """

    __tablename__ = "student_achievements"
    __table_args__ = (Index("ix_student_achievements_student", "student_id"),)

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="academic")
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="achieved")
    achieved_on: Mapped[Optional[date]] = mapped_column(Date)
    target_value: Mapped[Optional[int]] = mapped_column(Integer)
    current_value: Mapped[Optional[int]] = mapped_column(Integer)
    unit: Mapped[Optional[str]] = mapped_column(String(40))
    shared_with_parents: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class ProjectMilestone(Base, _School, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "project_milestones"
    __table_args__ = (Index("ix_project_milestones_project", "project_id"),)

    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    due_on: Mapped[Optional[date]] = mapped_column(Date)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class CanteenMenu(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """The day-school canteen's weekly menu (0 = Monday)."""

    __tablename__ = "canteen_menu"
    __table_args__ = (
        UniqueConstraint("school_id", "day_of_week", "meal", name="uq_canteen_menu_slot"),
    )

    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    meal: Mapped[str] = mapped_column(String(20), nullable=False)
    items: Mapped[str] = mapped_column(String(500), nullable=False)
