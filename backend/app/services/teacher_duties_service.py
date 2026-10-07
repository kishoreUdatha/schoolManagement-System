"""A teacher's duties beyond their own timetable: lessons they cover for an
absent colleague (set on Substitutions) and exam rooms they watch (set on
Invigilation). Both are given by the office; this is the teacher's view."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.academic import SchoolClass, Section
from app.models.cover import Substitution
from app.models.exam import Exam, ExamSubject
from app.models.exam_ops import Invigilation
from app.models.facility import Room
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period
from app.models.user import User


def duties(db: Session, user_id: int, school_id: int, today: date | None = None) -> dict:
    today = today or date.today()
    cover = []
    rows = db.execute(
        select(Substitution, Period, Section.name, SchoolClass.name, Subject.name, User.full_name)
        .join(Period, Period.id == Substitution.period_id)
        .join(Section, Section.id == Substitution.section_id)
        .join(SchoolClass, SchoolClass.id == Section.class_id)
        .join(ClassSubject, ClassSubject.id == Substitution.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .outerjoin(User, User.id == Substitution.absent_user_id)
        .where(Substitution.school_id == school_id, Substitution.substitute_user_id == user_id,
               Substitution.sub_date >= today, Substitution.sub_date <= today + timedelta(days=7))
        .order_by(Substitution.sub_date, Period.start_time)
    ).all()
    for s, p, sec, cls, subj, absent in rows:
        cover.append({"date": s.sub_date, "period": p.label or f"Period {p.period_number}", "start_time": p.start_time,
                      "end_time": p.end_time, "class_label": f"{cls} {sec}", "subject": subj,
                      "absent_teacher": absent, "note": s.note})
    exams = []
    rows = db.execute(
        select(Invigilation, ExamSubject, Exam.name, Room.name, Subject.name, SchoolClass.name)
        .join(ExamSubject, ExamSubject.id == Invigilation.exam_subject_id)
        .join(Exam, Exam.id == ExamSubject.exam_id)
        .join(Room, Room.id == Invigilation.room_id)
        .join(ClassSubject, ClassSubject.id == ExamSubject.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .join(SchoolClass, SchoolClass.id == ClassSubject.class_id)
        .where(Invigilation.school_id == school_id, Invigilation.user_id == user_id,
               ExamSubject.exam_date >= today, ExamSubject.exam_date <= today + timedelta(days=30))
        .order_by(ExamSubject.exam_date, ExamSubject.start_time)
    ).all()
    for inv, paper, exam, room, subj, cls in rows:
        exams.append({"date": paper.exam_date, "start_time": paper.start_time, "duration_minutes": paper.duration_minutes,
                      "exam": exam, "paper": f"{cls} {subj}", "room": room, "is_chief": inv.is_chief})
    return {"cover": cover, "invigilation": exams}
