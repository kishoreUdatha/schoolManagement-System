from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus
from app.core.scoping import school_today
from app.models.academic import SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.holiday import Holiday
from app.models.student import Student
from app.services import holiday_service, teacher_service


# Past edit window — class teacher can edit yesterday through 7 days ago.
EDIT_WINDOW_DAYS = 7


def _section_label(db: Session, section_id: int) -> Optional[str]:
    sec = db.get(Section, section_id)
    if not sec:
        return None
    cls = db.get(SchoolClass, sec.class_id)
    return f"{cls.name} {sec.name}" if cls else sec.name


def _check_date(target: date, today: date) -> tuple[bool, int]:
    """Return (is_editable, window_days_remaining_or_zero).

    `today` is the school's date, passed in rather than read here. On a UTC
    server an Asia/Kolkata school is already on tomorrow from 18:30, so a
    teacher marking a register in the first hours of the morning was told
    the day they were standing in was in the future.
    """
    if target > today:
        return False, 0
    if target == today:
        return True, EDIT_WINDOW_DAYS
    age = (today - target).days
    if age <= EDIT_WINDOW_DAYS:
        return True, EDIT_WINDOW_DAYS - age
    return False, 0


def _holiday_for(db: Session, school_id: int, target: date) -> Optional[Holiday]:
    return db.execute(
        select(Holiday).where(
            Holiday.school_id == school_id,
            Holiday.start_date <= target,
            Holiday.end_date >= target,
        ).limit(1)
    ).scalar_one_or_none()


def _check_class_teacher_access(
    db: Session, teacher_user_id: int, section_id: int, school_id: int
) -> Section:
    """For attendance marking, only the section's class teacher can mark.

    Subject teachers can see rosters (Story 3.2), but per-period subject
    attendance is a future story; daily attendance is class-teacher only.
    """
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    if sec.class_teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the class teacher can mark daily attendance for this section",
        )
    return sec


def get_view(
    db: Session, teacher_user_id: int, school_id: int, section_id: int, on_date: date
) -> dict:
    sec = _check_class_teacher_access(db, teacher_user_id, section_id, school_id)
    is_editable, _ = _check_date(on_date, school_today(db, school_id))
    holiday = _holiday_for(db, school_id, on_date)

    students = db.execute(
        select(Student).where(
            Student.section_id == section_id,
            Student.is_active.is_(True),
        ).order_by(Student.roll_no, Student.full_name)
    ).scalars().all()

    existing_rows = db.execute(
        select(StudentAttendance).where(
            StudentAttendance.section_id == section_id,
            StudentAttendance.date == on_date,
        )
    ).scalars().all()
    by_student = {a.student_id: a for a in existing_rows}
    from app.services import register_service
    from app.services.cover_service import leave_map

    session = register_service.get_session(db, school_id, section_id, on_date)
    locked = bool(session and session.status.value == "locked")

    on_leave = leave_map(db, [s.id for s in students], on_date)

    rows = []
    summary = {
        "present": 0,
        "absent": 0,
        "late": 0,
        "half_day": 0,
        "unmarked": 0,
        "total": len(students),
    }
    for s in students:
        a = by_student.get(s.id)
        if a:
            summary[a.status.value] += 1
        else:
            summary["unmarked"] += 1
        rows.append(
            {
                "student_id": s.id,
                "admission_no": s.admission_no,
                "roll_no": s.roll_no,
                "full_name": s.full_name,
                "photo_url": s.photo_url,
                "status": a.status if a else None,
                "remark": a.remark if a else None,
                "arrived_at": a.arrived_at if a else None,
                "left_at": a.left_at if a else None,
                "marked_by_user_id": a.marked_by_user_id if a else None,
                "marked_at": a.updated_at if a else None,
                "on_leave": on_leave.get(s.id),
            }
        )

    return {
        "section_id": section_id,
        "section_label": _section_label(db, section_id),
        "date": on_date,
        "is_holiday": holiday is not None,
        "holiday_name": holiday.name if holiday else None,
        "is_editable": is_editable and holiday is None and not locked,
        "is_locked": locked,
        "locked_at": session.locked_at if session else None,
        "edit_window_days": EDIT_WINDOW_DAYS,
        "rows": rows,
        "summary": summary,
    }


def save(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    section_id: int,
    on_date: date,
    entries: list[dict],
) -> dict:
    sec = _check_class_teacher_access(db, teacher_user_id, section_id, school_id)

    today = school_today(db, school_id)
    is_editable, _ = _check_date(on_date, today)
    if not is_editable:
        if on_date > today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark attendance for a future date",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Attendance for this date is locked. Edit window is "
                f"the last {EDIT_WINDOW_DAYS} days."
            ),
        )

    holiday = _holiday_for(db, school_id, on_date)
    if holiday:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{on_date.isoformat()}' is a holiday ({holiday.name}) — no attendance expected.",
        )

    # Validate students belong to this section
    valid_student_ids = {
        s.id
        for s in db.execute(
            select(Student).where(
                Student.section_id == section_id, Student.is_active.is_(True)
            )
        ).scalars().all()
    }

    # Snapshot prior statuses so we only alert on transitions INTO absent.
    prior_status: dict[int, str] = {
        a.student_id: a.status.value
        for a in db.execute(
            select(StudentAttendance).where(
                StudentAttendance.section_id == section_id,
                StudentAttendance.date == on_date,
            )
        ).scalars().all()
    }

    saved = 0
    skipped = 0
    errors = []
    newly_absent: list[int] = []
    from app.services import register_service
    from app.services.cover_service import leave_map

    if register_service.is_locked(db, school_id, section_id, on_date):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This register is locked. Ask the office to reopen it.",
        )

    # Parents who applied for leave don't need an "absent" alert.
    on_leave = leave_map(db, valid_student_ids, on_date)

    for e in entries:
        student_id = e.get("student_id") if isinstance(e, dict) else e.student_id
        status_val = e.get("status") if isinstance(e, dict) else e.status
        remark = e.get("remark") if isinstance(e, dict) else e.remark
        # Only touch the check-in time when the caller sent one (or null).
        has_arrival = ("arrived_at" in e) if isinstance(e, dict) else ("arrived_at" in e.model_fields_set)
        arrived_at = (e.get("arrived_at") if isinstance(e, dict) else e.arrived_at) if has_arrival else None

        if student_id not in valid_student_ids:
            errors.append({"student_id": student_id, "error": "Not in this section"})
            skipped += 1
            continue

        # Upsert: ON CONFLICT (student_id, date) update status + remark + marked_by
        if hasattr(status_val, "value"):
            status_value = status_val.value
        else:
            status_value = status_val

        if status_value == AttendanceStatus.absent.value and student_id in on_leave:
            remark = remark or on_leave[student_id]
        elif (
            status_value == AttendanceStatus.absent.value
            and prior_status.get(student_id) != AttendanceStatus.absent.value
        ):
            newly_absent.append(student_id)

        stmt = (
            pg_insert(StudentAttendance.__table__)
            .values(
                tenant_id=tenant_id,
                school_id=school_id,
                student_id=student_id,
                section_id=section_id,
                date=on_date,
                status=status_value,
                remark=remark,
                arrived_at=arrived_at,
                marked_by_user_id=teacher_user_id,
            )
            .on_conflict_do_update(
                constraint="uq_student_attendance_per_day",
                set_={
                    "status": status_value,
                    "remark": remark,
                    "marked_by_user_id": teacher_user_id,
                    "updated_at": datetime.now(timezone.utc),
                    **({"arrived_at": arrived_at} if has_arrival else {}),
                },
            )
        )
        db.execute(stmt)
        saved += 1

    register_service.touch(db, tenant_id, school_id, section_id, on_date, teacher_user_id)
    db.commit()

    alerts_sent = _send_absence_notices(
        db, tenant_id, school_id, teacher_user_id, section_id, on_date, newly_absent
    )

    return {
        "section_id": section_id,
        "date": on_date,
        "saved": saved,
        "skipped": skipped,
        "errors": errors,
        "absence_alerts_sent": alerts_sent,
    }


def _send_absence_notices(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    section_id: int,
    on_date: date,
    newly_absent_student_ids: list[int],
) -> int:
    """Send one in-app notice per newly-absent student to linked parents.

    Failure to alert must never roll back the underlying attendance save —
    teachers should be able to mark even if the notice infra is unhappy.
    """
    if not newly_absent_student_ids:
        return 0

    from app.core.enums import NoticeAudience, NoticeChannel
    from app.schemas.notice import NoticeCreate
    from app.services import notice_service

    section_label = _section_label(db, section_id) or f"section #{section_id}"
    sent = 0
    for student_id in newly_absent_student_ids:
        student = db.get(Student, student_id)
        if not student:
            continue
        data = NoticeCreate(
            title=f"Absence notice: {student.full_name}",
            body=(
                f"Your child {student.full_name} was marked absent on "
                f"{on_date.isoformat()} in {section_label}. "
                "Please contact the school if this is incorrect."
            ),
            audience=NoticeAudience.single_parent,
            audience_student_id=student_id,
            channels=[NoticeChannel.in_app],
        )
        try:
            n = notice_service.create(
                db, tenant_id, school_id, teacher_user_id, data
            )
            notice_service.send(db, n.id, school_id)
            sent += 1
        except HTTPException:
            # Most likely: student has no linked parent yet. Swallow and move on.
            db.rollback()
        except Exception:
            db.rollback()
    return sent
