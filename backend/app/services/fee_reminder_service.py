"""Story 13.3 — Automatic fee reminders.

Sends per-student in-app notices when:
    - a pending fee is due in 7 days
    - a pending fee is due in 1 day
    - a pending fee is 1 / 7 / 30 days overdue

All sends are idempotent for a given (student_fee, kind, date) via the unique
constraint on FeeReminderLog. Re-running the orchestrator within the same day
is a no-op.

The in_app channel is the only one wired today; SMS/WhatsApp/email rely on
the notice_service routing, which currently records them as 'skipped' until
providers are connected.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    FeeReminderKind,
    FeeStatus,
    NoticeAudience,
    NoticeChannel,
)
from app.models.fee import StudentFee
from app.models.fee_reminder import FeeReminderLog
from app.models.student import Student
from app.schemas.notice import NoticeCreate


# Days BEFORE due_date that we send a pre-due reminder
_PRE_DUE_KINDS = {
    7: FeeReminderKind.pre_due_7,
    1: FeeReminderKind.pre_due_1,
}

# Days AFTER due_date that we send an overdue reminder
_OVERDUE_KINDS = {
    1: FeeReminderKind.overdue_1,
    7: FeeReminderKind.overdue_7,
    30: FeeReminderKind.overdue_30,
}


def _outstanding(fee: StudentFee) -> Decimal:
    due = Decimal(fee.amount_due or 0)
    paid = Decimal(fee.amount_paid or 0)
    return due - paid


def _due_kinds_for(today: date, due: date) -> list[FeeReminderKind]:
    """Which reminder kinds apply to this fee TODAY based on the date diff."""
    kinds: list[FeeReminderKind] = []
    delta = (due - today).days  # positive = still in future, negative = overdue
    if delta in _PRE_DUE_KINDS:
        kinds.append(_PRE_DUE_KINDS[delta])
    overdue_by = -delta
    if overdue_by in _OVERDUE_KINDS:
        kinds.append(_OVERDUE_KINDS[overdue_by])
    return kinds


def _format_body(student: Student, fee: StudentFee, kind: FeeReminderKind, today: date) -> tuple[str, str]:
    outstanding = _outstanding(fee)
    pretty_due = fee.due_date.isoformat()
    pretty_amount = f"₹{outstanding}"
    if kind in (FeeReminderKind.pre_due_7, FeeReminderKind.pre_due_1):
        days_until = (fee.due_date - today).days
        when = "in 1 day" if days_until == 1 else f"in {days_until} days"
        title = f"Fee due {when} for {student.full_name}"
        body = (
            f"Hi, this is a friendly reminder that {pretty_amount} for "
            f"{student.full_name} is due on {pretty_due} ({when}). "
            "Please pay via your usual channel to avoid late charges."
        )
    else:
        overdue_by = (today - fee.due_date).days
        when = f"{overdue_by} day{'s' if overdue_by != 1 else ''}"
        title = f"OVERDUE: {pretty_amount} for {student.full_name}"
        body = (
            f"{pretty_amount} for {student.full_name} was due on {pretty_due} "
            f"and is now {when} overdue. Please clear the dues at the earliest."
        )
    return title, body


def find_due_for_reminder(
    db: Session, school_id: int, today: date | None = None
) -> list[tuple[StudentFee, FeeReminderKind]]:
    today = today or date.today()
    earliest = today - timedelta(days=max(_OVERDUE_KINDS))
    latest = today + timedelta(days=max(_PRE_DUE_KINDS))

    fees = list(
        db.execute(
            select(StudentFee).where(
                StudentFee.school_id == school_id,
                StudentFee.status == FeeStatus.pending,
                StudentFee.due_date >= earliest,
                StudentFee.due_date <= latest,
            )
        ).scalars().all()
    )

    out: list[tuple[StudentFee, FeeReminderKind]] = []
    for f in fees:
        if _outstanding(f) <= 0:
            continue
        for k in _due_kinds_for(today, f.due_date):
            out.append((f, k))
    return out


def send_reminder(
    db: Session,
    fee: StudentFee,
    kind: FeeReminderKind,
    today: date,
) -> FeeReminderLog | None:
    """Create the notice + log row. Returns None if already sent today."""
    # Local-import to avoid circular dep at module load
    from app.services import notice_service

    # Skip if we've already logged this kind for this fee today.
    existing = db.execute(
        select(FeeReminderLog).where(
            FeeReminderLog.student_fee_id == fee.id,
            FeeReminderLog.kind == kind,
            FeeReminderLog.send_date == today,
        )
    ).scalar_one_or_none()
    if existing:
        return None

    student = db.get(Student, fee.student_id)
    if not student:
        return None
    title, body = _format_body(student, fee, kind, today)

    notice_id: int | None = None
    try:
        n = notice_service.create(
            db,
            tenant_id=fee.tenant_id,
            school_id=fee.school_id,
            created_by_user_id=None,
            data=NoticeCreate(
                title=title,
                body=body,
                audience=NoticeAudience.single_parent,
                audience_student_id=student.id,
                channels=[NoticeChannel.in_app],
            ),
        )
        notice_service.send(db, n.id, fee.school_id)
        notice_id = n.id
    except Exception:
        db.rollback()  # leave the notice attempt undone, still log the attempt

    log = FeeReminderLog(
        tenant_id=fee.tenant_id,
        school_id=fee.school_id,
        student_fee_id=fee.id,
        kind=kind,
        send_date=today,
        sent_at=datetime.now(timezone.utc),
        notice_id=notice_id,
    )
    db.add(log)
    try:
        db.commit()
    except IntegrityError:
        # Race: another runner inserted the same log between our SELECT
        # and our INSERT. Treat as a no-op.
        db.rollback()
        return None
    db.refresh(log)
    return log


def run_daily(db: Session, school_id: int, today: date | None = None) -> dict:
    """Top-level orchestrator. Returns a summary for logging/UI."""
    today = today or date.today()
    pairs = find_due_for_reminder(db, school_id, today)
    sent = 0
    skipped = 0
    by_kind: dict[str, int] = {}
    for fee, kind in pairs:
        log = send_reminder(db, fee, kind, today)
        if log is None:
            skipped += 1
        else:
            sent += 1
            by_kind[kind.value] = by_kind.get(kind.value, 0) + 1
    return {
        "school_id": school_id,
        "ran_at": datetime.now(timezone.utc),
        "today": today,
        "candidates": len(pairs),
        "sent": sent,
        "skipped_already_sent": skipped,
        "by_kind": by_kind,
    }


def run_daily_for_all_schools(db: Session, today: date | None = None) -> list[dict]:
    """Used by the asyncio scheduler."""
    from app.models.tenant import School

    today = today or date.today()
    school_ids = list(
        db.execute(select(School.id).where(School.is_active.is_(True))).scalars().all()
    )
    results = []
    for sid in school_ids:
        try:
            results.append(run_daily(db, sid, today))
        except Exception as e:  # noqa: BLE001
            results.append({"school_id": sid, "error": str(e), "today": today})
    return results


# ----- History query (for the UI) -----

def list_history(
    db: Session, school_id: int, *, limit: int = 100
) -> list[FeeReminderLog]:
    stmt = (
        select(FeeReminderLog)
        .where(FeeReminderLog.school_id == school_id)
        .order_by(FeeReminderLog.sent_at.desc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())
