"""Figures the dashboards and reports show that no single module owns.

Almost everything here is worked out from records other modules already
keep — the timetable, the school calendar, the audit trail, homework hand-ins.
The one thing that has to be written down as it happens is the health probe
(see HealthSample), because yesterday's latency cannot be measured today.
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import AuditAction, EventAudience, UserRole
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.audit import AuditLog
from app.models.events import SchoolEvent
from app.models.facility import Room
from app.models.health_sample import HealthSample
from app.models.homework import Homework, HomeworkSubmission
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.tenant import School
from app.models.timetable import Period, TimetableEntry
from app.models.user import User


def _months_back(n: int, today: Optional[date] = None) -> list[str]:
    today = today or date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def _month_end(ym: str) -> date:
    y, m = int(ym[:4]), int(ym[5:])
    nxt = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
    return nxt - timedelta(days=1)


# ---------------------------------------------------------------- today's schedule


def _current_year_ids(db: Session, school_id: int) -> Optional[set[int]]:
    ids = set(db.execute(
        select(AcademicYear.id).where(AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True))
    ).scalars())
    return ids or None


def _school_periods_today(db: Session, school_id: int, today: date) -> list[dict]:
    """The school's timetable for today, one line per period: how many
    classes are in session and which subjects are being taught."""
    periods = list(db.execute(
        select(Period)
        .where(Period.school_id == school_id, Period.day_of_week == today.isoweekday())
        .order_by(Period.period_number)
    ).scalars())
    if not periods:
        return []
    years = _current_year_ids(db, school_id)
    stmt = (
        select(TimetableEntry.period_id, Subject.name, SchoolClass.name, Section.name)
        .join(Section, Section.id == TimetableEntry.section_id)
        .join(SchoolClass, SchoolClass.id == Section.class_id)
        .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .where(TimetableEntry.period_id.in_([p.id for p in periods]))
    )
    if years:
        stmt = stmt.where(SchoolClass.academic_year_id.in_(years))
    by_period: dict[int, list[tuple[str, str]]] = {}
    for period_id, subject, cname, sname in db.execute(stmt).all():
        by_period.setdefault(period_id, []).append((subject, f"{cname} {sname}"))

    out = []
    for p in periods:
        name = p.label or f"Period {p.period_number}"
        if p.is_break:
            out.append(dict(start_time=p.start_time, end_time=p.end_time, title=name,
                            sub="Break", kind="break"))
            continue
        lessons = by_period.get(p.id, [])
        if not lessons:
            continue
        if len(lessons) == 1:
            subject, where = lessons[0]
            out.append(dict(start_time=p.start_time, end_time=p.end_time, title=subject,
                            sub=f"{name} · {where}", kind="lesson"))
            continue
        top = [f"{s} ×{n}" if n > 1 else s for s, n in Counter(s for s, _ in lessons).most_common(3)]
        more = len({s for s, _ in lessons}) - len(top)
        out.append(dict(
            start_time=p.start_time, end_time=p.end_time, title=name,
            sub=f"{len(lessons)} classes in session · {', '.join(top)}{f' +{more} more' if more > 0 else ''}",
            kind="lesson",
        ))
    return out


def _my_periods_today(db: Session, user: User, today: date) -> list[dict]:
    """The lessons this person teaches today."""
    rows = db.execute(
        select(Period, Subject.name, SchoolClass.name, Section.name, Room.name)
        .join(TimetableEntry, TimetableEntry.period_id == Period.id)
        .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .join(Section, Section.id == TimetableEntry.section_id)
        .join(SchoolClass, SchoolClass.id == Section.class_id)
        .join(Room, Room.id == TimetableEntry.room_id, isouter=True)
        .where(
            Period.school_id == user.school_id,
            Period.day_of_week == today.isoweekday(),
            ClassSubject.teacher_user_id == user.id,
        )
        .order_by(Period.period_number)
    ).all()
    return [
        dict(start_time=p.start_time, end_time=p.end_time, title=subject,
             sub=" · ".join(x for x in (f"{cname} {sname}", room) if x), kind="lesson")
        for p, subject, cname, sname, room in rows
    ]


_CAL_KIND = {"event": "event", "ptm": "meeting", "ptm_slot": "meeting", "exam": "exam", "holiday": "holiday"}


def today_schedule(db: Session, user: User) -> dict:
    """What is on today, in time order.

    The head and the office see the whole school: every period with the
    classes in session, plus whatever is on the calendar. Everyone else sees
    their own day: the lessons they teach, their parent meetings, and the
    school's events for today.
    """
    from app.services import events_service

    today = date.today()
    school_wide = user.role in (UserRole.school_admin, UserRole.principal)
    cal = [c for c in events_service.staff_calendar(db, user, today, today) if not c.get("is_cancelled")]
    holiday = next((c["title"] for c in cal if c["type"] == "holiday"), None)

    items: list[dict] = []
    for c in cal:
        if c["type"] == "holiday":
            continue
        if c.get("is_draft"):
            continue
        items.append(dict(
            start_time=c.get("start_time"), end_time=c.get("end_time"), title=c["title"],
            sub=" · ".join(x for x in ("Exam" if c["type"] == "exam" else None, c.get("detail")) if x) or "School calendar",
            kind=_CAL_KIND.get(c["type"], "event"),
        ))
    # A holiday means the timetable is not running.
    if not holiday:
        items += _school_periods_today(db, user.school_id, today) if school_wide else _my_periods_today(db, user, today)

    items.sort(key=lambda i: (i["start_time"] is not None, i["start_time"] or time.min))
    return {"date": today, "scope": "school" if school_wide else "personal", "holiday": holiday, "items": items}


# ---------------------------------------------------------------- recent activity


# Changes that happen on their own (a sign-in stamps last_login_at) are not
# anybody doing anything, and would drown the feed.
_NOISE_KEYS = {"last_login_at", "updated_at", "failed_login_attempts", "locked_until", "last_seen_at"}
_NAME_KEYS = ("full_name", "student_name", "name", "title", "subject", "admission_no", "code", "period")
_HIDE_ENTITIES = {"RefreshToken", "PasswordReset", "LoginAttempt"}


def _entity_label(entity: str) -> str:
    words = re.sub(r"(?<!^)(?=[A-Z])", " ", entity).split()
    return " ".join([words[0]] + [w.lower() for w in words[1:]]) if words else entity


def _is_noise(a: AuditLog) -> bool:
    if a.entity_type in _HIDE_ENTITIES:
        return True
    if a.action == AuditAction.update:
        keys = set((a.new_values or {}).keys()) | set((a.old_values or {}).keys())
        return not keys or keys <= _NOISE_KEYS
    return False


def _describe(a: AuditLog) -> tuple[str, Optional[str]]:
    vals = a.new_values or a.old_values or {}
    old = a.old_values or {}
    name = None
    for k in _NAME_KEYS:
        v = vals.get(k) or old.get(k)
        if isinstance(v, (str, int)) and str(v).strip():
            name = str(v).strip()[:80]
            break
    thing = _entity_label(a.entity_type)
    if a.action == AuditAction.create:
        return f"{thing} added", name
    if a.action == AuditAction.delete:
        return f"{thing} removed", name
    new = a.new_values or {}
    for key in ("status", "stage"):
        if isinstance(new.get(key), str):
            return f"{thing} marked {new[key].replace('_', ' ')}", name
    for key, yes, no in (("is_published", "published", "unpublished"), ("is_active", "reactivated", "deactivated"),
                         ("is_cancelled", "cancelled", "reinstated")):
        if isinstance(new.get(key), bool):
            return f"{thing} {yes if new[key] else no}", name
    changed = [k.replace("_", " ") for k in new.keys() if k not in _NOISE_KEYS][:3]
    detail = f"changed {', '.join(changed)}" if changed else None
    return f"{thing} updated", " · ".join(x for x in (name, detail) if x) or None


def activity_feed(db: Session, *, school_id: Optional[int] = None, tenant_id: Optional[int] = None,
                  limit: int = 10) -> list[dict]:
    """The latest things people did, in words, from the audit trail.

    Values are not passed through — only a name for the record and which
    fields changed — so the feed can be shown to people who may not open
    the full audit log.
    """
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    if school_id is not None:
        stmt = stmt.where(AuditLog.school_id == school_id)
    if tenant_id is not None:
        stmt = stmt.where(or_(
            AuditLog.tenant_id == tenant_id,
            and_(AuditLog.entity_type == "Tenant", AuditLog.entity_id == tenant_id),
        ))
    out: list[dict] = []
    users: dict[int, Optional[User]] = {}
    offset, page = 0, max(limit * 8, 80)
    while len(out) < limit and offset < 4000:
        rows = list(db.execute(stmt.limit(page).offset(offset)).scalars())
        if not rows:
            break
        offset += page
        for a in rows:
            if _is_noise(a):
                continue
            if a.user_id and a.user_id not in users:
                users[a.user_id] = db.get(User, a.user_id)
            who = users.get(a.user_id) if a.user_id else None
            title, sub = _describe(a)
            out.append({
                "id": a.id,
                "action": a.action.value,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "title": title,
                "detail": sub,
                "user_name": who.full_name if who else None,
                "user_role": who.role.value if who else None,
                "created_at": a.created_at,
            })
            if len(out) >= limit:
                break
    return out


# ---------------------------------------------------------------- platform history


def active_schools_by_month(db: Session, months: int = 6) -> list[dict]:
    """For each of the last few months: schools on the platform at the end of
    it, and how many of them anybody used (anything in the audit trail, a
    sign-in included)."""
    window = _months_back(months)
    first = date(int(window[0][:4]), int(window[0][5:]), 1)
    used = dict(db.execute(
        select(
            func.to_char(AuditLog.created_at, "YYYY-MM").label("month"),
            func.count(func.distinct(AuditLog.school_id)),
        )
        .where(AuditLog.school_id.is_not(None), AuditLog.created_at >= first)
        .group_by("month")
    ).all())
    created = [c.date() for c in db.execute(select(School.created_at)).scalars()]
    out = []
    for m in window:
        end = _month_end(m)
        out.append({"month": m, "schools": sum(1 for c in created if c <= end), "active": used.get(m, 0)})
    return out


def record_health(db: Session, checks: list[dict], *, min_gap_seconds: int = 60) -> bool:
    """Keep the monitored checks of one probe. Probes closer together than
    `min_gap_seconds` are not kept, so reloading the page does not flood the
    series. Returns whether anything was written."""
    now = datetime.now(timezone.utc)
    last = db.execute(select(func.max(HealthSample.checked_at))).scalar_one()
    if last and (now - last).total_seconds() < min_gap_seconds:
        return False
    for c in checks:
        if not c.get("monitored"):
            continue
        db.add(HealthSample(checked_at=now, service=c["name"], state=c["state"], latency_ms=c.get("latency_ms")))
    # A small series: three months is plenty for a trend.
    db.execute(delete(HealthSample).where(HealthSample.checked_at < now - timedelta(days=90)))
    db.commit()
    return True


def health_history(db: Session, days: int = 7) -> dict:
    """Availability and response time from the kept probes."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    rows = list(db.execute(
        select(HealthSample).where(HealthSample.checked_at >= since).order_by(HealthSample.checked_at)
    ).scalars())
    services: dict[str, dict] = {}
    for r in rows:
        s = services.setdefault(r.service, {"service": r.service, "samples": 0, "up": 0, "lat": [], "last_state": None,
                                            "last_checked_at": None, "last_down_at": None})
        s["samples"] += 1
        s["up"] += r.state == "up"
        if r.latency_ms is not None:
            s["lat"].append(r.latency_ms)
        s["last_state"], s["last_checked_at"] = r.state, r.checked_at
        if r.state != "up":
            s["last_down_at"] = r.checked_at
    out_services = []
    for s in services.values():
        lat = sorted(s.pop("lat"))
        s["availability"] = round(s["up"] / s["samples"] * 100, 2) if s["samples"] else None
        s["avg_latency_ms"] = round(sum(lat) / len(lat), 1) if lat else None
        s["p95_latency_ms"] = round(lat[min(len(lat) - 1, int(len(lat) * 0.95))], 1) if lat else None
        out_services.append(s)

    # Response time over the last 24 hours, in four-hour blocks (six points,
    # which is what the dashboard chart draws).
    blocks = []
    start = now - timedelta(hours=24)
    for i in range(6):
        a, b = start + timedelta(hours=4 * i), start + timedelta(hours=4 * (i + 1))
        lat = [r.latency_ms for r in rows if a <= r.checked_at < b and r.latency_ms is not None]
        blocks.append({"from": a, "to": b, "avg_latency_ms": round(sum(lat) / len(lat), 1) if lat else None,
                       "samples": len(lat)})
    return {
        "days": days,
        "since": since,
        "samples": len({r.checked_at for r in rows}),
        "first_sample_at": rows[0].checked_at if rows else None,
        "services": out_services,
        "response_time": blocks,
    }


# ---------------------------------------------------------------- student


def learning_streak(db: Session, student: Student) -> dict:
    """Homework handed in on time, in a row, counting back from the latest.

    Homework due today that is not in yet does not break the run — there is
    still time. Anything earlier that was missed or late does.
    """
    empty = {"count": 0, "since": None, "on_time": 0, "set": 0}
    if not student.section_id:
        return empty
    section = db.get(Section, student.section_id)
    if not section:
        return empty
    today = date.today()
    work = list(db.execute(
        select(Homework.id, Homework.due_date)
        .join(ClassSubject, ClassSubject.id == Homework.class_subject_id)
        .where(
            Homework.school_id == student.school_id,
            ClassSubject.class_id == section.class_id,
            Homework.due_date <= today,
        )
        .order_by(Homework.due_date.desc(), Homework.id.desc())
    ).all())
    handed = dict(db.execute(
        select(HomeworkSubmission.homework_id, HomeworkSubmission.submitted_at)
        .where(HomeworkSubmission.student_id == student.id)
    ).all())

    def on_time(hid: int, due: date) -> bool:
        at = handed.get(hid)
        return at is not None and at.date() <= due

    count, since, broken = 0, None, False
    for hid, due in work:
        if not broken:
            if on_time(hid, due):
                count, since = count + 1, due
            elif due == today and hid not in handed:
                continue
            else:
                broken = True
    return {
        "count": count,
        "since": since,
        "on_time": sum(1 for hid, due in work if on_time(hid, due)),
        "set": len(work),
    }


def student_calendar(db: Session, student: Student, start: date, end: date) -> list[dict]:
    """The school calendar as it concerns this child: holidays, exams, and
    the published events aimed at the whole school, the parents, or the
    child's own class or section. Staff-only events stay out."""
    from app.services import events_service

    items = events_service._base_items(db, student.school_id, start, end)
    class_id = None
    if student.section_id:
        sec = db.get(Section, student.section_id)
        class_id = sec.class_id if sec else None
    events = db.execute(
        select(SchoolEvent).where(
            SchoolEvent.school_id == student.school_id,
            SchoolEvent.is_published.is_(True),
            SchoolEvent.end_date >= start,
            SchoolEvent.start_date <= end,
            or_(
                SchoolEvent.audience.in_([EventAudience.everyone, EventAudience.parents]),
                and_(SchoolEvent.audience == EventAudience.class_parents, SchoolEvent.class_id == (class_id or -1)),
                and_(SchoolEvent.audience == EventAudience.section_parents,
                     SchoolEvent.section_id == (student.section_id or -1)),
            ),
        )
    ).scalars()
    items += [events_service._event_item(e) for e in events]
    return events_service._sorted(items)


# ---------------------------------------------------------------- monthly counts


def monthly_counts(db: Session, column, *where, months: int = 6) -> list[dict]:
    """How many rows per month over the last `months`, by a date or
    timestamp column, zero-filled."""
    window = _months_back(months)
    first = date(int(window[0][:4]), int(window[0][5:]), 1)
    rows = dict(db.execute(
        select(func.to_char(column, "YYYY-MM").label("month"), func.count())
        .where(column >= first, *where)
        .group_by("month")
    ).all())
    return [{"month": m, "value": rows.get(m, 0)} for m in window]
