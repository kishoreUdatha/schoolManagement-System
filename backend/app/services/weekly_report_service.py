"""Stories 12.1 + 12.2 — Weekly report generation + parent view.

Generation aggregates the prior week's data per student in a section:
    - Attendance counts and weighted %
    - Homework submission rate
    - Marks summary by recent exam papers (count + avg %)
    - Behaviour rating average (latest week)

One row per (student, week_start). Re-running for the same week overwrites
the snapshot (so teachers can refresh after late marks).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus, SubmissionStatus
from app.models.academic import Section
from app.models.attendance import StudentAttendance
from app.models.behaviour import BehaviourRating
from app.models.exam import ExamSubject
from app.models.homework import Homework, HomeworkSubmission
from app.models.mark import Mark
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject
from app.models.user import User
from app.models.weekly_report import WeeklyReport
from app.schemas.weekly_report import (
    WeeklyReportGenerateRequest,
    WeeklyReportSetRemark,
)


def _week_end(week_start: date) -> date:
    return week_start + timedelta(days=6)


def _attendance_for(
    db: Session, student_id: int, ws: date, we: date
) -> dict:
    rows = db.execute(
        select(StudentAttendance.status, func.count(StudentAttendance.id))
        .where(
            StudentAttendance.student_id == student_id,
            StudentAttendance.date >= ws,
            StudentAttendance.date <= we,
        )
        .group_by(StudentAttendance.status)
    ).all()
    counts = {s.value: 0 for s in AttendanceStatus}
    for s_val, n in rows:
        key = s_val.value if hasattr(s_val, "value") else s_val
        counts[key] = int(n)
    marked = sum(counts.values())
    effective = counts["present"] + counts["late"] + 0.5 * counts["half_day"]
    pct = round((effective / marked) * 100, 2) if marked else 0.0
    return {
        "attendance_marked": marked,
        "attendance_present": counts["present"],
        "attendance_absent": counts["absent"],
        "attendance_late": counts["late"],
        "attendance_half_day": counts["half_day"],
        "attendance_pct": pct,
    }


def _homework_for(
    db: Session, student_id: int, ws: date, we: date, class_id: int
) -> dict:
    # Homework posted to the student's class during the week
    cs_ids = list(
        db.execute(
            select(ClassSubject.id).where(ClassSubject.class_id == class_id)
        ).scalars().all()
    )
    if not cs_ids:
        return {
            "homework_total": 0,
            "homework_submitted": 0,
            "homework_submission_pct": 0.0,
        }
    total = db.execute(
        select(func.count(Homework.id)).where(
            Homework.class_subject_id.in_(cs_ids),
            Homework.due_date >= ws,
            Homework.due_date <= we,
        )
    ).scalar_one()
    submitted = db.execute(
        select(func.count(HomeworkSubmission.id))
        .join(Homework, HomeworkSubmission.homework_id == Homework.id)
        .where(
            Homework.class_subject_id.in_(cs_ids),
            Homework.due_date >= ws,
            Homework.due_date <= we,
            HomeworkSubmission.student_id == student_id,
        )
    ).scalar_one()
    pct = round((submitted / total) * 100, 2) if total else 0.0
    return {
        "homework_total": int(total),
        "homework_submitted": int(submitted),
        "homework_submission_pct": pct,
    }


def _marks_for(db: Session, student_id: int, ws: date, we: date) -> Optional[dict]:
    rows = db.execute(
        select(
            ExamSubject.max_marks,
            Mark.marks_obtained,
            Mark.is_pass,
        )
        .join(ExamSubject, Mark.exam_subject_id == ExamSubject.id)
        .where(
            Mark.student_id == student_id,
            ExamSubject.exam_date >= ws,
            ExamSubject.exam_date <= we,
            Mark.marks_obtained.is_not(None),
        )
    ).all()
    if not rows:
        return None
    total_pct = sum((m / x) * 100 for x, m, _ in rows if x)
    passed = sum(1 for _x, _m, p in rows if p)
    return {
        "papers": len(rows),
        "avg_pct": round(total_pct / len(rows), 2),
        "pass_rate_pct": round(passed / len(rows) * 100, 2),
    }


def _behaviour_for(db: Session, student_id: int) -> Optional[float]:
    """Latest behaviour rating average (over the 4 sub-scores)."""
    r = db.execute(
        select(BehaviourRating)
        .where(BehaviourRating.student_id == student_id)
        .order_by(BehaviourRating.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not r:
        return None
    total = (
        (r.punctuality or 0)
        + (r.participation or 0)
        + (r.discipline or 0)
        + (r.respect or 0)
    )
    return round(total / 4.0, 2)


def generate_for_section(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    data: WeeklyReportGenerateRequest,
) -> list[WeeklyReport]:
    sec = db.get(Section, data.section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    if sec.class_teacher_user_id != teacher_user_id:
        # School admin / principal could also drive this — but for MVP, only
        # the class teacher generates.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the section's class teacher can generate weekly reports",
        )

    we = _week_end(data.week_start)
    students = db.execute(
        select(Student)
        .where(Student.section_id == data.section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.full_name)
    ).scalars().all()

    out: list[WeeklyReport] = []
    for s in students:
        att = _attendance_for(db, s.id, data.week_start, we)
        hw = _homework_for(db, s.id, data.week_start, we, sec.class_id)
        marks = _marks_for(db, s.id, data.week_start, we)
        behaviour = _behaviour_for(db, s.id)

        existing = db.execute(
            select(WeeklyReport).where(
                WeeklyReport.student_id == s.id,
                WeeklyReport.week_start == data.week_start,
            )
        ).scalar_one_or_none()

        if existing:
            for k, v in att.items():
                setattr(existing, k, v)
            for k, v in hw.items():
                setattr(existing, k, v)
            existing.marks_summary = marks
            existing.behaviour_avg = behaviour
            existing.teacher_remark = data.teacher_remark
            existing.generated_by_user_id = teacher_user_id
            existing.shared_at = (
                datetime.now(timezone.utc) if data.share_with_parents else None
            )
            out.append(existing)
        else:
            r = WeeklyReport(
                tenant_id=tenant_id,
                school_id=school_id,
                student_id=s.id,
                week_start=data.week_start,
                **att,
                **hw,
                marks_summary=marks,
                behaviour_avg=behaviour,
                teacher_remark=data.teacher_remark,
                generated_by_user_id=teacher_user_id,
                shared_at=(
                    datetime.now(timezone.utc) if data.share_with_parents else None
                ),
            )
            db.add(r)
            out.append(r)

    db.commit()
    for r in out:
        db.refresh(r)
    return out


def to_read_dict(db: Session, r: WeeklyReport) -> dict:
    student = db.get(Student, r.student_id)
    gen = db.get(User, r.generated_by_user_id) if r.generated_by_user_id else None
    return {
        "id": r.id,
        "student_id": r.student_id,
        "student_name": student.full_name if student else None,
        "student_admission_no": student.admission_no if student else None,
        "week_start": r.week_start,
        "week_end": _week_end(r.week_start),
        "attendance_marked": r.attendance_marked,
        "attendance_present": r.attendance_present,
        "attendance_absent": r.attendance_absent,
        "attendance_late": r.attendance_late,
        "attendance_half_day": r.attendance_half_day,
        "attendance_pct": float(r.attendance_pct or 0),
        "homework_total": r.homework_total,
        "homework_submitted": r.homework_submitted,
        "homework_submission_pct": float(r.homework_submission_pct or 0),
        "marks_summary": r.marks_summary,
        "behaviour_avg": float(r.behaviour_avg) if r.behaviour_avg is not None else None,
        "teacher_remark": r.teacher_remark,
        "generated_by_name": gen.full_name if gen else None,
        "shared_at": r.shared_at,
        "created_at": r.created_at,
    }


def list_for_section_week(
    db: Session, section_id: int, week_start: date, school_id: int
) -> list[WeeklyReport]:
    return list(
        db.execute(
            select(WeeklyReport)
            .join(Student, WeeklyReport.student_id == Student.id)
            .where(
                WeeklyReport.school_id == school_id,
                Student.section_id == section_id,
                WeeklyReport.week_start == week_start,
            )
            .order_by(Student.roll_no, Student.full_name)
        ).scalars().all()
    )


def list_for_child(
    db: Session, parent_user_id: int, student_id: int, *, limit: int = 12
) -> list[WeeklyReport]:
    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )
    return list(
        db.execute(
            select(WeeklyReport)
            .where(
                WeeklyReport.student_id == student_id,
                WeeklyReport.shared_at.is_not(None),
            )
            .order_by(WeeklyReport.week_start.desc())
            .limit(limit)
        ).scalars().all()
    )


def set_remark(
    db: Session,
    report_id: int,
    teacher_user_id: int,
    school_id: int,
    data: WeeklyReportSetRemark,
) -> WeeklyReport:
    r = db.get(WeeklyReport, report_id)
    if not r or r.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    student = db.get(Student, r.student_id)
    sec = db.get(Section, student.section_id) if student else None
    if not sec or sec.class_teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the class teacher can edit this report",
        )
    if data.teacher_remark is not None:
        r.teacher_remark = data.teacher_remark.strip() or None
    if data.share_with_parents is True and r.shared_at is None:
        r.shared_at = datetime.now(timezone.utc)
    elif data.share_with_parents is False:
        r.shared_at = None
    db.commit()
    db.refresh(r)
    return r
