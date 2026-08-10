"""Story 6.2 — Teacher's own timetable across all class-subjects they teach.

Reads existing timetable_entries; this is a pure read service. The
class-teacher role also shows up here (Section.class_teacher_user_id) so a
homeroom teacher sees their section even for free periods.
"""
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.academic import SchoolClass, Section
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry


# Display labels for day_of_week (1=Mon ... 7=Sun, ISO)
DAY_LABELS = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}


def get_for_teacher(db: Session, teacher_user_id: int, school_id: int) -> dict:
    """Return a structured week view + today's flag + next-class hint."""
    rows = list(
        db.execute(
            select(
                TimetableEntry,
                Period,
                ClassSubject,
                Subject,
                SchoolClass,
                Section,
            )
            .join(Period, TimetableEntry.period_id == Period.id)
            .join(ClassSubject, TimetableEntry.class_subject_id == ClassSubject.id)
            .join(Subject, ClassSubject.subject_id == Subject.id)
            .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
            .join(Section, TimetableEntry.section_id == Section.id)
            .where(
                TimetableEntry.school_id == school_id,
                ClassSubject.teacher_user_id == teacher_user_id,
            )
            .order_by(Period.day_of_week, Period.period_number)
        ).all()
    )

    today_iso_day = date.today().isoweekday()  # 1..7
    now = datetime.now().time()

    by_day: dict[int, list[dict]] = {d: [] for d in range(1, 8)}
    next_class: dict | None = None

    for te, period, _cs, subj, cls, sec in rows:
        item = {
            "entry_id": te.id,
            "section_id": sec.id,
            "section_label": f"{cls.name} {sec.name}",
            "class_id": cls.id,
            "class_name": cls.name,
            "subject_id": subj.id,
            "subject_name": subj.name,
            "subject_code": subj.code,
            "period_id": period.id,
            "period_number": period.period_number,
            "period_label": period.label,
            "start_time": period.start_time,
            "end_time": period.end_time,
            "is_break": period.is_break,
            "day_of_week": period.day_of_week,
            "day_label": DAY_LABELS.get(period.day_of_week, "?"),
            "notes": te.notes,
        }
        by_day[period.day_of_week].append(item)

        # Find first today-or-later class whose end_time hasn't passed
        if next_class is None:
            if period.day_of_week == today_iso_day and period.end_time > now:
                next_class = item

    return {
        "today_day_of_week": today_iso_day,
        "today_label": DAY_LABELS.get(today_iso_day, "?"),
        "current_time": now,
        "today": by_day.get(today_iso_day, []),
        "by_day": [
            {
                "day_of_week": d,
                "day_label": DAY_LABELS[d],
                "is_today": d == today_iso_day,
                "items": by_day[d],
            }
            for d in range(1, 8)
        ],
        "next_class": next_class,
        "total_entries": sum(len(v) for v in by_day.values()),
    }
