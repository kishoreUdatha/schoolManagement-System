"""Aggregations for Story 7.3 — Attendance reports.

Three views the principal/admin needs:
  1. daily_absent   — who was absent on date X (with section + class + remark)
  2. class_summary  — per class/section attendance breakdown over a date range
  3. student_monthly — per student counts + attendance % for a month in one section

All are read-only and scoped to the caller's school_id.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus
from app.models.academic import SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.student import Student


# Weighting for attendance %: late counts as full present, half_day as 0.5.
def _attendance_pct(present: int, late: int, half_day: int, absent: int) -> float:
    marked = present + late + half_day + absent
    if marked == 0:
        return 0.0
    effective = present + late + 0.5 * half_day
    return round((effective / marked) * 100, 2)


# --- 1. Daily absent ---

def daily_absent(
    db: Session,
    school_id: int,
    on_date: date,
    *,
    class_id: Optional[int] = None,
    section_id: Optional[int] = None,
) -> list[dict]:
    stmt = (
        select(
            StudentAttendance.student_id,
            StudentAttendance.remark,
            Student.admission_no,
            Student.full_name,
            Student.roll_no,
            Section.id.label("section_id"),
            Section.name.label("section_name"),
            SchoolClass.id.label("class_id"),
            SchoolClass.name.label("class_name"),
        )
        .join(Student, StudentAttendance.student_id == Student.id)
        .join(Section, StudentAttendance.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(
            StudentAttendance.school_id == school_id,
            StudentAttendance.date == on_date,
            StudentAttendance.status == AttendanceStatus.absent,
        )
        .order_by(SchoolClass.name, Section.name, Student.roll_no)
    )
    if section_id:
        stmt = stmt.where(Section.id == section_id)
    elif class_id:
        stmt = stmt.where(SchoolClass.id == class_id)

    return [
        {
            "student_id": r.student_id,
            "admission_no": r.admission_no,
            "full_name": r.full_name,
            "roll_no": r.roll_no,
            "section_id": r.section_id,
            "class_name": r.class_name,
            "section_name": r.section_name,
            "remark": r.remark,
        }
        for r in db.execute(stmt).all()
    ]


# --- 2. Class summary ---

def class_summary(
    db: Session,
    school_id: int,
    from_date: date,
    to_date: date,
    *,
    class_id: Optional[int] = None,
) -> list[dict]:
    if from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date must be on or before to_date",
        )

    present_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.present, 1), else_=0)
    )
    absent_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.absent, 1), else_=0)
    )
    late_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.late, 1), else_=0)
    )
    half_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.half_day, 1), else_=0)
    )

    stmt = (
        select(
            SchoolClass.id.label("class_id"),
            SchoolClass.name.label("class_name"),
            Section.id.label("section_id"),
            Section.name.label("section_name"),
            func.count().label("total_marks"),
            present_case.label("present"),
            absent_case.label("absent"),
            late_case.label("late"),
            half_case.label("half_day"),
            func.count(func.distinct(StudentAttendance.date)).label("distinct_days"),
            func.count(func.distinct(StudentAttendance.student_id)).label("distinct_students"),
        )
        .join(Section, StudentAttendance.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(
            StudentAttendance.school_id == school_id,
            StudentAttendance.date >= from_date,
            StudentAttendance.date <= to_date,
        )
        .group_by(SchoolClass.id, SchoolClass.name, Section.id, Section.name)
        .order_by(SchoolClass.name, Section.name)
    )
    if class_id:
        stmt = stmt.where(SchoolClass.id == class_id)

    out = []
    for r in db.execute(stmt).all():
        present = int(r.present or 0)
        absent = int(r.absent or 0)
        late = int(r.late or 0)
        half = int(r.half_day or 0)
        out.append(
            {
                "class_id": r.class_id,
                "class_name": r.class_name,
                "section_id": r.section_id,
                "section_name": r.section_name,
                "total_marks": int(r.total_marks or 0),
                "present": present,
                "absent": absent,
                "late": late,
                "half_day": half,
                "distinct_days": int(r.distinct_days or 0),
                "distinct_students": int(r.distinct_students or 0),
                "attendance_pct": _attendance_pct(present, late, half, absent),
            }
        )
    return out


# --- 3. Student monthly ---

def _month_range(year: int, month: int) -> tuple[date, date]:
    if month < 1 or month > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="month must be 1..12"
        )
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def student_monthly(
    db: Session,
    school_id: int,
    section_id: int,
    year: int,
    month: int,
) -> dict:
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    cls = db.get(SchoolClass, sec.class_id)

    from_date, to_date = _month_range(year, month)

    present_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.present, 1), else_=0)
    )
    absent_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.absent, 1), else_=0)
    )
    late_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.late, 1), else_=0)
    )
    half_case = func.sum(
        case((StudentAttendance.status == AttendanceStatus.half_day, 1), else_=0)
    )

    counts_stmt = (
        select(
            StudentAttendance.student_id,
            present_case.label("present"),
            absent_case.label("absent"),
            late_case.label("late"),
            half_case.label("half_day"),
        )
        .where(
            StudentAttendance.school_id == school_id,
            StudentAttendance.section_id == section_id,
            StudentAttendance.date >= from_date,
            StudentAttendance.date <= to_date,
        )
        .group_by(StudentAttendance.student_id)
    )
    counts_by_student = {
        r.student_id: r for r in db.execute(counts_stmt).all()
    }

    roster = db.execute(
        select(Student)
        .where(Student.section_id == section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.full_name)
    ).scalars().all()

    rows = []
    totals = {"present": 0, "absent": 0, "late": 0, "half_day": 0}
    for s in roster:
        c = counts_by_student.get(s.id)
        present = int(c.present) if c else 0
        absent = int(c.absent) if c else 0
        late = int(c.late) if c else 0
        half = int(c.half_day) if c else 0
        totals["present"] += present
        totals["absent"] += absent
        totals["late"] += late
        totals["half_day"] += half
        rows.append(
            {
                "student_id": s.id,
                "admission_no": s.admission_no,
                "roll_no": s.roll_no,
                "full_name": s.full_name,
                "present": present,
                "absent": absent,
                "late": late,
                "half_day": half,
                "marked_days": present + absent + late + half,
                "attendance_pct": _attendance_pct(present, late, half, absent),
            }
        )

    overall_pct = _attendance_pct(
        totals["present"], totals["late"], totals["half_day"], totals["absent"]
    )
    return {
        "section_id": section_id,
        "section_label": f"{cls.name} {sec.name}" if cls else sec.name,
        "year": year,
        "month": month,
        "from_date": from_date,
        "to_date": to_date,
        "rows": rows,
        "totals": totals,
        "overall_pct": overall_pct,
    }
