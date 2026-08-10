from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import StaffAttendanceStatus, UserRole
from app.models.holiday import Holiday
from app.models.staff_attendance import StaffAttendance
from app.models.tenant import School
from app.models.user import User


# Grace minutes past school_start_time before marking late.
LATE_GRACE_MINUTES = 15


def _holiday_for(db: Session, school_id: int, target: date) -> Optional[Holiday]:
    return db.execute(
        select(Holiday).where(
            Holiday.school_id == school_id,
            Holiday.start_date <= target,
            Holiday.end_date >= target,
        ).limit(1)
    ).scalar_one_or_none()


def _school(db: Session, school_id: int) -> School:
    return db.get(School, school_id)


def _user_brief(db: Session, user_id: int) -> tuple[Optional[str], Optional[str]]:
    u = db.get(User, user_id)
    if not u:
        return None, None
    return u.full_name, u.role.value


def _to_read_dict(db: Session, rec: StaffAttendance) -> dict:
    full_name, role = _user_brief(db, rec.user_id)
    return {
        "id": rec.id,
        "user_id": rec.user_id,
        "user_full_name": full_name,
        "user_role": role,
        "date": rec.date,
        "check_in_at": rec.check_in_at,
        "check_out_at": rec.check_out_at,
        "status": rec.status,
        "manually_overridden": rec.manually_overridden,
        "override_remark": rec.override_remark,
        "override_by_user_id": rec.override_by_user_id,
    }


def _today_local(school: School) -> date:
    # All times stored UTC; computing today from UTC is fine for MVP — school
    # timezone field exists on the School profile for a future refinement.
    return datetime.now(timezone.utc).date()


def _classify_check_in(school: School, check_in_at: datetime) -> StaffAttendanceStatus:
    if not school or not school.school_start_time:
        return StaffAttendanceStatus.present
    school_start = school.school_start_time
    threshold = datetime.combine(
        check_in_at.date(),
        school_start,
        tzinfo=check_in_at.tzinfo or timezone.utc,
    ) + timedelta(minutes=LATE_GRACE_MINUTES)
    return (
        StaffAttendanceStatus.late
        if check_in_at > threshold
        else StaffAttendanceStatus.present
    )


def get_today(db: Session, user: User) -> dict:
    school = _school(db, user.school_id)
    today = _today_local(school)
    holiday = _holiday_for(db, user.school_id, today)

    record = db.execute(
        select(StaffAttendance).where(
            StaffAttendance.user_id == user.id,
            StaffAttendance.date == today,
        )
    ).scalar_one_or_none()

    return {
        "date": today,
        "has_record": record is not None,
        "check_in_at": record.check_in_at if record else None,
        "check_out_at": record.check_out_at if record else None,
        "status": record.status if record else None,
        "is_holiday": holiday is not None,
        "holiday_name": holiday.name if holiday else None,
        "school_start_time": (
            school.school_start_time.strftime("%H:%M")
            if school and school.school_start_time
            else None
        ),
        "manually_overridden": record.manually_overridden if record else False,
        "override_remark": record.override_remark if record else None,
    }


def check_in(db: Session, user: User) -> StaffAttendance:
    school = _school(db, user.school_id)
    today = _today_local(school)
    holiday = _holiday_for(db, user.school_id, today)
    if holiday:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Today is a holiday ({holiday.name}) — no check-in needed.",
        )

    existing = db.execute(
        select(StaffAttendance).where(
            StaffAttendance.user_id == user.id,
            StaffAttendance.date == today,
        )
    ).scalar_one_or_none()
    if existing and existing.check_in_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Already checked in at {existing.check_in_at.strftime('%H:%M')}.",
        )

    now = datetime.now(timezone.utc)
    computed_status = _classify_check_in(school, now)

    if existing:
        existing.check_in_at = now
        if not existing.manually_overridden:
            existing.status = computed_status
        db.commit()
        db.refresh(existing)
        return existing

    rec = StaffAttendance(
        tenant_id=user.tenant_id,
        school_id=user.school_id,
        user_id=user.id,
        date=today,
        check_in_at=now,
        status=computed_status,
        manually_overridden=False,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def check_out(db: Session, user: User) -> StaffAttendance:
    school = _school(db, user.school_id)
    today = _today_local(school)

    rec = db.execute(
        select(StaffAttendance).where(
            StaffAttendance.user_id == user.id,
            StaffAttendance.date == today,
        )
    ).scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Check in first before checking out.",
        )
    if not rec.check_in_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No check-in recorded for today.",
        )
    if rec.check_out_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Already checked out at {rec.check_out_at.strftime('%H:%M')}.",
        )
    rec.check_out_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rec)
    return rec


def list_history(
    db: Session, user: User, *, year: int, month: int
) -> dict:
    if month < 1 or month > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be 1-12",
        )
    last = monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, last)

    records = db.execute(
        select(StaffAttendance).where(
            StaffAttendance.user_id == user.id,
            StaffAttendance.date >= month_start,
            StaffAttendance.date <= month_end,
        ).order_by(StaffAttendance.date)
    ).scalars().all()

    summary = {
        "total_days": len(records),
        "present": 0,
        "late": 0,
        "absent": 0,
        "on_leave": 0,
        "sick": 0,
        "holiday": 0,
    }
    for r in records:
        summary[r.status.value] = summary.get(r.status.value, 0) + 1

    return {
        "year": year,
        "month": month,
        "summary": summary,
        "records": [_to_read_dict(db, r) for r in records],
    }


# ----- School admin side -----

def list_for_admin(
    db: Session,
    school_id: int,
    *,
    user_id: Optional[int] = None,
    on_date: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> list[dict]:
    stmt = select(StaffAttendance).where(StaffAttendance.school_id == school_id)
    if user_id:
        stmt = stmt.where(StaffAttendance.user_id == user_id)
    if on_date:
        stmt = stmt.where(StaffAttendance.date == on_date)
    elif year and month:
        last = monthrange(year, month)[1]
        stmt = stmt.where(
            StaffAttendance.date >= date(year, month, 1),
            StaffAttendance.date <= date(year, month, last),
        )
    stmt = stmt.order_by(StaffAttendance.date.desc(), StaffAttendance.user_id)
    return [_to_read_dict(db, r) for r in db.execute(stmt).scalars().all()]


def override(
    db: Session,
    actor: User,
    school_id: int,
    target_user_id: int,
    on_date: date,
    new_status: StaffAttendanceStatus,
    remark: Optional[str],
) -> StaffAttendance:
    # Validate target user belongs to the same school and is teacher/staff
    target = db.get(User, target_user_id)
    if (
        not target
        or target.school_id != school_id
        or target.role not in (UserRole.teacher, UserRole.staff)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff user not found in this school",
        )

    rec = db.execute(
        select(StaffAttendance).where(
            StaffAttendance.user_id == target_user_id,
            StaffAttendance.date == on_date,
        )
    ).scalar_one_or_none()

    if rec:
        rec.status = new_status
        rec.manually_overridden = True
        rec.override_remark = remark
        rec.override_by_user_id = actor.id
    else:
        rec = StaffAttendance(
            tenant_id=target.tenant_id,
            school_id=school_id,
            user_id=target_user_id,
            date=on_date,
            status=new_status,
            manually_overridden=True,
            override_remark=remark,
            override_by_user_id=actor.id,
        )
        db.add(rec)

    db.commit()
    db.refresh(rec)
    return rec
