"""End-to-end smoke test for Story 13.3 — Auto fee reminders.

Verifies:
    Pending fees due in 7 days / 1 day → pre-due reminders fired.
    Pending fees overdue by 1 / 7 / 30 days → overdue reminders fired.
    Re-running same day is idempotent (skipped, no duplicate notices).
    Reminder for the LINKED parent lands in the parent inbox.
    /school/fees/reminders/run + /school/fees/reminders history endpoints work.

Run:
    docker exec sms-backend python -m scripts.smoketest_fee_reminders
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import FeeStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.fee_reminder import FeeReminderLog
from app.models.notice import Notice, NoticeRecipient
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
SCHOOL_ADMIN = ("school@sms.local", "SchoolPass123!")
PARENT = ("sharma@dev.local", "ParentPass123!")
STUDENT_ID = 1  # Aarav, linked to sharma@dev.local
TENANT_ID = 2
SCHOOL_ID = 2


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def reset_passwords():
    db = SessionLocal()
    try:
        for email, pw in (SCHOOL_ADMIN, PARENT):
            u = db.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if u:
                u.password_hash = hash_password(pw)
                u.is_active = True
        db.commit()
    finally:
        db.close()


def cleanup_smoke_state(today: date):
    """Remove smoke-created fees + reminders + notices so each run is fresh."""
    db = SessionLocal()
    try:
        # Find smoke fees by notes prefix
        fees = db.execute(
            select(StudentFee).where(
                StudentFee.notes.like("SMOKE 13.3 -%"),
            )
        ).scalars().all()
        fee_ids = [f.id for f in fees]
        if fee_ids:
            db.execute(
                FeeReminderLog.__table__.delete().where(
                    FeeReminderLog.student_fee_id.in_(fee_ids)
                )
            )
            for f in fees:
                db.delete(f)
        # Reminder notices created by the service all start with "Fee due" or "OVERDUE:"
        notices = db.execute(
            select(Notice).where(
                Notice.school_id == SCHOOL_ID,
                Notice.title.like("Fee due%"),
            )
        ).scalars().all() + db.execute(
            select(Notice).where(
                Notice.school_id == SCHOOL_ID,
                Notice.title.like("OVERDUE:%"),
            )
        ).scalars().all()
        for n in notices:
            db.execute(
                NoticeRecipient.__table__.delete().where(
                    NoticeRecipient.notice_id == n.id
                )
            )
            db.delete(n)
        db.commit()
    finally:
        db.close()


def ensure_smoke_fee_structure() -> tuple[int, int]:
    """Pick / create a fee head + fee_structure to attach smoke fees to."""
    db = SessionLocal()
    try:
        head = db.execute(
            select(FeeHead).where(FeeHead.school_id == SCHOOL_ID).limit(1)
        ).scalar_one_or_none()
        if not head:
            head = FeeHead(
                tenant_id=TENANT_ID,
                school_id=SCHOOL_ID,
                name="Smoke 13.3 Tuition",
                code="SMOKE13",
                frequency="monthly",
            )
            db.add(head)
            db.flush()
        struct = db.execute(
            select(FeeStructure).where(
                FeeStructure.school_id == SCHOOL_ID,
                FeeStructure.fee_head_id == head.id,
            ).limit(1)
        ).scalar_one_or_none()
        if not struct:
            struct = FeeStructure(
                tenant_id=TENANT_ID,
                school_id=SCHOOL_ID,
                academic_year_id=2,
                fee_head_id=head.id,
                amount=1000,
                applies_from=date.today() - timedelta(days=365),
                applies_to=None,
            )
            db.add(struct)
            db.flush()
        db.commit()
        return head.id, struct.id
    finally:
        db.close()


_SMOKE_PERIODS = {
    "pre7": "2099-01",
    "pre1": "2099-02",
    "due0": "2099-03",
    "ovr1": "2099-04",
    "ovr7": "2099-05",
    "ovr30": "2099-06",
    "ovr15": "2099-07",
}


def create_smoke_fee(
    head_id: int, struct_id: int, due_offset_days: int, label: str
) -> int:
    """Make a pending fee due `due_offset_days` from today (negative = overdue)."""
    db = SessionLocal()
    try:
        due = date.today() + timedelta(days=due_offset_days)
        f = StudentFee(
            tenant_id=TENANT_ID,
            school_id=SCHOOL_ID,
            student_id=STUDENT_ID,
            fee_structure_id=struct_id,
            fee_head_id=head_id,
            period=_SMOKE_PERIODS[label],
            amount_due=Decimal("1000"),
            amount_paid=Decimal("0"),
            due_date=due,
            status=FeeStatus.pending,
            notes=f"SMOKE 13.3 - {label}",
        )
        db.add(f)
        db.commit()
        db.refresh(f)
        return f.id
    finally:
        db.close()


def count_logs_for(fee_ids: list[int]) -> int:
    db = SessionLocal()
    try:
        from sqlalchemy import func
        return db.execute(
            select(func.count(FeeReminderLog.id)).where(
                FeeReminderLog.student_fee_id.in_(fee_ids)
            )
        ).scalar_one()
    finally:
        db.close()


def main():
    section("RESET + cleanup")
    reset_passwords()
    today = date.today()
    cleanup_smoke_state(today)
    head_id, struct_id = ensure_smoke_fee_structure()

    section("Create smoke fees at each reminder offset")
    offsets = {
        "pre7": 7,
        "pre1": 1,
        "due0": 0,  # not a reminder day → should be skipped
        "ovr1": -1,
        "ovr7": -7,
        "ovr30": -30,
        "ovr15": -15,  # not a reminder day → should be skipped
    }
    fee_ids = {}
    for label, off in offsets.items():
        fee_ids[label] = create_smoke_fee(head_id, struct_id, off, label)
        print(f"  fee_{label} id={fee_ids[label]} due_offset={off}")

    section("Login + trigger run")
    code, data = request(
        "POST",
        "/school/auth/login",
        body={"email": SCHOOL_ADMIN[0], "password": SCHOOL_ADMIN[1]},
    )
    assert code == 200, data
    token = data["access_token"]

    code, result = request("POST", "/school/fees/reminders/run", token=token)
    print(f"  {code} candidates={result.get('candidates')} sent={result.get('sent')} by_kind={result.get('by_kind')}")
    assert code == 200, result

    section("Verify only the 5 reminder-day fees produced log rows")
    log_count = count_logs_for(list(fee_ids.values()))
    print(f"  logs for smoke fees: {log_count}")
    assert log_count == 5, log_count  # pre7, pre1, ovr1, ovr7, ovr30

    section("Re-run is idempotent")
    code, result2 = request("POST", "/school/fees/reminders/run", token=token)
    print(f"  {code} sent={result2.get('sent')} skipped={result2.get('skipped_already_sent')}")
    assert code == 200, result2
    assert result2["sent"] == 0, result2
    log_count2 = count_logs_for(list(fee_ids.values()))
    assert log_count2 == log_count, (log_count, log_count2)

    section("Parent inbox shows the reminder")
    code, data = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT[0], "password": PARENT[1]},
    )
    assert code == 200, data
    parent_token = data["access_token"]
    code, inbox = request("GET", "/parent/me/notices", token=parent_token)
    titles = [n["title"] for n in inbox]
    fee_titles = [t for t in titles if "OVERDUE" in t or "Fee due" in t]
    print(f"  parent sees {len(fee_titles)} fee-reminder notices (of {len(titles)} total)")
    assert any("Fee due in 7 days" in t for t in titles), titles
    assert any("Fee due in 1 day" in t for t in titles), titles
    assert any(t.startswith("OVERDUE:") for t in titles), titles

    section("History endpoint")
    code, history = request("GET", "/school/fees/reminders", token=token)
    assert code == 200, history
    smoke_history = [h for h in history if h["student_fee_id"] in fee_ids.values()]
    print(f"  history shows {len(smoke_history)} smoke entries with student_name='{smoke_history[0]['student_name'] if smoke_history else 'N/A'}'")
    assert len(smoke_history) == 5, smoke_history
    assert smoke_history[0]["student_name"], smoke_history[0]

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
