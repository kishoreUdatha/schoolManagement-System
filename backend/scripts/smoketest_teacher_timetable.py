"""End-to-end smoke test for Story 6.2 — Teacher timetable view.

Seeds (idempotently) a few periods + timetable entries for teacher iyer on
multiple days, then hits /teacher/timetable and verifies the response.

Run:
    docker exec sms-backend python -m scripts.smoketest_teacher_timetable
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, time

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.subject import ClassSubject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
SCHOOL_ID = devdata.school()["school_id"]
TENANT_ID = devdata.school()["tenant_id"]


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


def reset_password():
    db = SessionLocal()
    try:
        u = db.execute(
            select(User).where(User.email == TEACHER[0])
        ).scalar_one_or_none()
        if u:
            u.password_hash = hash_password(TEACHER[1])
            u.is_active = True
            db.commit()
    finally:
        db.close()


def ensure_period(day_of_week: int, period_number: int, start_h: int) -> int:
    db = SessionLocal()
    try:
        p = db.execute(
            select(Period).where(
                Period.school_id == SCHOOL_ID,
                Period.day_of_week == day_of_week,
                Period.period_number == period_number,
            )
        ).scalar_one_or_none()
        if p:
            return p.id
        p = Period(
            tenant_id=TENANT_ID,
            school_id=SCHOOL_ID,
            day_of_week=day_of_week,
            period_number=period_number,
            start_time=time(start_h, 0),
            end_time=time(start_h, 45),
            label=f"Period {period_number}",
            is_break=False,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p.id
    finally:
        db.close()


def ensure_entry(section_id: int, period_id: int, class_subject_id: int):
    db = SessionLocal()
    try:
        existing = db.execute(
            select(TimetableEntry).where(
                TimetableEntry.section_id == section_id,
                TimetableEntry.period_id == period_id,
            )
        ).scalar_one_or_none()
        if existing:
            return
        te = TimetableEntry(
            tenant_id=TENANT_ID,
            school_id=SCHOOL_ID,
            section_id=section_id,
            period_id=period_id,
            class_subject_id=class_subject_id,
        )
        db.add(te)
        db.commit()
    finally:
        db.close()


def pick_class_subject_for_teacher(teacher_user_id: int) -> int:
    db = SessionLocal()
    try:
        cs_id = db.execute(
            select(ClassSubject.id).where(
                ClassSubject.teacher_user_id == teacher_user_id
            ).limit(1)
        ).scalar_one()
        return cs_id
    finally:
        db.close()


def main():
    section("RESET + login")
    reset_password()
    code, data = request(
        "POST",
        "/teacher/auth/login",
        body={"email": TEACHER[0], "password": TEACHER[1]},
    )
    assert code == 200, data
    teacher_id = data["user"]["id"]
    token = data["access_token"]
    print(f"  teacher id={teacher_id}")

    cs_id = pick_class_subject_for_teacher(teacher_id)
    print(f"  class_subject_id for seed: {cs_id}")

    section("Seed periods + entries on Mon, Tue, Wed, and today")
    today_dow = date.today().isoweekday()
    days_to_seed = sorted({1, 2, 3, today_dow})  # ensure today included
    p_ids: dict[int, int] = {}
    for dow in days_to_seed:
        p_ids[dow] = ensure_period(dow, period_number=1, start_h=9)
    # Use the seeded section 1 (Grade 1 A)
    section_id = 1
    for dow, pid in p_ids.items():
        ensure_entry(section_id, pid, cs_id)

    section("GET /teacher/timetable")
    code, tt = request("GET", "/teacher/timetable", token=token)
    assert code == 200, tt
    print(
        f"  total_entries={tt['total_entries']} "
        f"today_label={tt['today_label']} "
        f"today_count={len(tt['today'])}"
    )
    assert tt["total_entries"] >= len(days_to_seed), tt

    # Verify today is populated
    assert tt["today_day_of_week"] == today_dow, tt
    assert len(tt["today"]) >= 1, tt

    section("Sample today's slot")
    slot = tt["today"][0]
    print(
        f"  P{slot['period_number']} {slot['start_time']}-{slot['end_time']}: "
        f"{slot['section_label']} {slot['subject_name']} ({slot['subject_code']})"
    )
    for k in (
        "section_label",
        "class_name",
        "subject_name",
        "subject_code",
        "period_number",
        "start_time",
        "end_time",
        "day_label",
    ):
        assert k in slot, k

    section("by_day has 7 days")
    assert len(tt["by_day"]) == 7
    today_block = next(d for d in tt["by_day"] if d["is_today"])
    assert today_block["day_of_week"] == today_dow
    print(f"  today block: {today_block['day_label']} with {len(today_block['items'])} item(s)")

    section("next_class hint")
    now = datetime.now().time()
    if slot["end_time"] > now.isoformat()[:5]:
        # naive string compare works for HH:MM:SS lex order
        pass
    print(f"  current_time={tt['current_time']} next_class={tt.get('next_class')}")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
