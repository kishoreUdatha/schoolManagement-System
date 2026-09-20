"""Story 8.2 — Staff leave workflow.

Apply / list / decide. On approval, materializes StaffAttendance rows for each
date in the range with status=on_leave (idempotent) and posts an in-app notice
to the applicant. Rejection also notifies the applicant.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.enums import (
    NoticeAudience,
    NoticeChannel,
    StaffAttendanceStatus,
    StaffLeaveStatus,
    UserRole,
)
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.user import User
from app.schemas.staff_leave import StaffLeaveCreate, StaffLeaveDecide
from app.services import hr_service


def to_read_dict(db: Session, l: StaffLeave) -> dict:
    applicant = db.get(User, l.applicant_user_id) if l.applicant_user_id else None
    decider = db.get(User, l.decided_by_user_id) if l.decided_by_user_id else None
    return {
        "id": l.id,
        "applicant_user_id": l.applicant_user_id,
        "applicant_name": applicant.full_name if applicant else None,
        "applicant_role": applicant.role.value if applicant else None,
        "kind": l.kind,
        "leave_type_id": l.leave_type_id,
        "from_date": l.from_date,
        "to_date": l.to_date,
        "days": (l.to_date - l.from_date).days + 1,
        "reason": l.reason,
        "status": l.status,
        "decided_by_user_id": l.decided_by_user_id,
        "decided_by_name": decider.full_name if decider else None,
        "decision_remark": l.decision_remark,
        "decided_at": l.decided_at,
        "created_at": l.created_at,
    }


def can_apply(user: User) -> bool:
    """Any school-side employee may apply."""
    return user.role in (
        UserRole.teacher,
        UserRole.staff,
        UserRole.principal,
        UserRole.accountant,
        UserRole.school_admin,
    )


def can_decide(user: User) -> bool:
    """School admin or principal decides."""
    return user.role in (UserRole.school_admin, UserRole.principal)


def apply_leave(
    db: Session,
    tenant_id: int,
    school_id: int,
    applicant_user_id: int,
    data: StaffLeaveCreate,
) -> StaffLeave:
    # Reject self-overlap with an already-pending/approved leave to avoid
    # confusing duplicates.
    overlap = db.execute(
        select(StaffLeave).where(
            StaffLeave.applicant_user_id == applicant_user_id,
            StaffLeave.status.in_(
                [StaffLeaveStatus.pending, StaffLeaveStatus.approved]
            ),
            StaffLeave.from_date <= data.to_date,
            StaffLeave.to_date >= data.from_date,
        )
    ).scalar_one_or_none()
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"You already have a {overlap.status.value} leave overlapping "
                f"{data.from_date} – {data.to_date}"
            ),
        )

    l = StaffLeave(
        tenant_id=tenant_id,
        school_id=school_id,
        applicant_user_id=applicant_user_id,
        kind=data.kind,
        leave_type_id=data.leave_type_id,
        from_date=data.from_date,
        to_date=data.to_date,
        reason=(data.reason or "").strip() or None,
        status=StaffLeaveStatus.pending,
    )
    if data.leave_type_id:
        from app.models.hr import LeaveType

        t = db.get(LeaveType, data.leave_type_id)
        if not t or t.school_id != school_id or not t.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown leave type")
        l.kind = t.kind
        hr_service.check_balance(db, l)
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def list_for_user(
    db: Session, applicant_user_id: int, *, limit: int = 100
) -> list[StaffLeave]:
    return list(
        db.execute(
            select(StaffLeave)
            .where(StaffLeave.applicant_user_id == applicant_user_id)
            .order_by(StaffLeave.from_date.desc(), StaffLeave.id.desc())
            .limit(limit)
        ).scalars().all()
    )


def list_for_school(
    db: Session,
    school_id: int,
    *,
    status_filter: Optional[StaffLeaveStatus] = None,
    limit: int = 200,
) -> list[StaffLeave]:
    stmt = (
        select(StaffLeave)
        .where(StaffLeave.school_id == school_id)
        .order_by(StaffLeave.status, StaffLeave.from_date.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(StaffLeave.status == status_filter)
    return list(db.execute(stmt).scalars().all())


def get(db: Session, leave_id: int, school_id: int) -> StaffLeave:
    l = db.get(StaffLeave, leave_id)
    if not l or l.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Leave not found"
        )
    return l


def cancel_own(
    db: Session, leave_id: int, applicant_user_id: int, school_id: int
) -> StaffLeave:
    l = get(db, leave_id, school_id)
    if l.applicant_user_id != applicant_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own leave",
        )
    if l.status != StaffLeaveStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a {l.status.value} leave",
        )
    was_approved = l.status == StaffLeaveStatus.approved
    l.status = StaffLeaveStatus.cancelled
    l.decided_at = datetime.now(timezone.utc)
    if was_approved:
        hr_service.consume(db, l, -1)  # give the days back
    db.commit()
    db.refresh(l)
    return l


def decide(
    db: Session,
    leave_id: int,
    school_id: int,
    reviewer_user_id: int,
    data: StaffLeaveDecide,
) -> StaffLeave:
    l = get(db, leave_id, school_id)
    if l.status != StaffLeaveStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Leave is already {l.status.value}",
        )
    if data.status not in (StaffLeaveStatus.approved, StaffLeaveStatus.rejected):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decision must be approved or rejected",
        )

    l.status = data.status
    l.decided_by_user_id = reviewer_user_id
    l.decision_remark = (data.decision_remark or "").strip() or None
    l.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(l)

    if data.status == StaffLeaveStatus.approved:
        hr_service.consume(db, l, 1)
        db.commit()
        _materialize_attendance(db, l)

    _notify_applicant(db, l)
    return l


def _materialize_attendance(db: Session, l: StaffLeave) -> None:
    """Upsert StaffAttendance rows with status=on_leave for the range."""
    cur = l.from_date
    while cur <= l.to_date:
        stmt = (
            pg_insert(StaffAttendance.__table__)
            .values(
                tenant_id=l.tenant_id,
                school_id=l.school_id,
                user_id=l.applicant_user_id,
                date=cur,
                status=StaffAttendanceStatus.on_leave.value,
                manually_overridden=True,
                override_remark=f"Approved leave #{l.id}",
                override_by_user_id=l.decided_by_user_id,
            )
            .on_conflict_do_update(
                constraint="uq_staff_attendance_per_day",
                set_={
                    "status": StaffAttendanceStatus.on_leave.value,
                    "manually_overridden": True,
                    "override_remark": f"Approved leave #{l.id}",
                    "override_by_user_id": l.decided_by_user_id,
                    "updated_at": datetime.now(timezone.utc),
                },
            )
        )
        db.execute(stmt)
        cur += timedelta(days=1)
    db.commit()


def _notify_applicant(db: Session, l: StaffLeave) -> None:
    """Send an in-app notice to the applicant; failures are non-fatal."""
    from app.schemas.notice import NoticeCreate
    from app.services import notice_service

    applicant = db.get(User, l.applicant_user_id)
    if not applicant:
        return

    if l.status == StaffLeaveStatus.approved:
        title = f"Leave approved: {l.from_date} – {l.to_date}"
        body = (
            f"Your {l.kind.value} leave from {l.from_date} to {l.to_date} has "
            "been approved."
        )
    elif l.status == StaffLeaveStatus.rejected:
        title = f"Leave rejected: {l.from_date} – {l.to_date}"
        body = (
            f"Your {l.kind.value} leave from {l.from_date} to {l.to_date} "
            "was rejected."
        )
    else:
        return
    if l.decision_remark:
        body += f"\nRemark: {l.decision_remark}"

    try:
        # Audience targeting parents/teachers doesn't fit; use single-staff path.
        # We don't have a "single_user" audience — best-effort: send via
        # all_staff and rely on the user being in scope. For MVP simplicity,
        # write a NoticeRecipient directly.
        from datetime import datetime as _dt
        from app.core.enums import NoticeStatus, RecipientStatus
        from app.models.notice import Notice, NoticeRecipient

        n = Notice(
            tenant_id=l.tenant_id,
            school_id=l.school_id,
            title=title,
            body=body,
            audience=NoticeAudience.all_staff,
            channels=[NoticeChannel.in_app.value],
            status=NoticeStatus.sent,
            sent_at=_dt.now(timezone.utc),
        )
        db.add(n)
        db.flush()
        db.add(
            NoticeRecipient(
                tenant_id=l.tenant_id,
                school_id=l.school_id,
                notice_id=n.id,
                user_id=l.applicant_user_id,
                channel=NoticeChannel.in_app,
                status=RecipientStatus.sent,
                sent_at=_dt.now(timezone.utc),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
