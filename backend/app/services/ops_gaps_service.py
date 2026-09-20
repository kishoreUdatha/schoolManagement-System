"""The small backend concepts the screens went without.

Each screen in here was built first and reported honestly that something
underneath it did not exist: an interview calendar that had to open every
application one at a time, an asset register that could say when a warranty
ran out but not when a service was due, a hostel with a warden but no rota,
a notice that could be scheduled but never sent.

They are collected here rather than scattered because they share a shape —
each is a few fields and one query that an existing screen already wanted.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import NoticeStatus
from app.models.hostel import Hostel
from app.models.hr import Candidate, CandidateApplication, InterviewSchedule, JobOpening
from app.models.inventory import Asset, AssetEvent
from app.models.notice import Notice
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


# ---------- interviews, across applications ----------


def interviews(db: Session, school_id: int, *, frm: date, to: date) -> dict:
    """Every interview in a window, in one query.

    The calendar screen was opening each application in turn to find its
    interviews, because nothing listed them. Eighty round trips to draw one
    week is the kind of thing that works in dev data and falls over in a
    school that actually recruits.
    """
    start = datetime.combine(frm, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(to, datetime.max.time(), tzinfo=timezone.utc)

    rows = db.execute(
        select(InterviewSchedule, CandidateApplication, Candidate, JobOpening)
        .join(CandidateApplication,
              CandidateApplication.id == InterviewSchedule.application_id)
        .join(Candidate, Candidate.id == CandidateApplication.candidate_id)
        .join(JobOpening, JobOpening.id == CandidateApplication.opening_id, isouter=True)
        .where(
            InterviewSchedule.school_id == school_id,
            InterviewSchedule.scheduled_at >= start,
            InterviewSchedule.scheduled_at <= end,
        )
        .order_by(InterviewSchedule.scheduled_at)
    ).all()

    out = []
    for iv, app, candidate, opening in rows:
        out.append({
            "interview_id": iv.id,
            "application_id": app.id,
            "candidate_name": candidate.full_name if candidate else None,
            "candidate_email": candidate.email if candidate else None,
            "opening_title": opening.title if opening else None,
            "round_no": iv.round_no,
            "scheduled_at": iv.scheduled_at,
            "minutes": iv.minutes,
            "mode": iv.mode.value if iv.mode else None,
            "place_or_link": iv.place_or_link,
            "panel": getattr(iv, "panel", None),
        })
    return {"from_date": frm, "to_date": to, "interviews": out, "count": len(out)}


# ---------- when a thing is next due a service ----------


def service_due(db: Session, school_id: int, *, within_days: int = 60) -> dict:
    """Assets whose next service or warranty is close, or past.

    `service_every_days` on the asset plus the last maintenance event is
    enough: a schedule table would be a second place for the same fact to be
    wrong. An asset with no interval set simply never appears here, which is
    correct — nobody has said it needs servicing.
    """
    today = date.today()
    horizon = today + timedelta(days=within_days)

    assets = list(db.execute(
        select(Asset).where(Asset.school_id == school_id)
    ).scalars())

    last_service: dict[int, date] = {}
    for event in db.execute(
        select(AssetEvent)
        .where(AssetEvent.asset_id.in_([a.id for a in assets] or [0]))
        .order_by(AssetEvent.happened_on.desc())
    ).scalars():
        if event.kind.value in ("maintenance", "repaired"):
            last_service.setdefault(event.asset_id, event.happened_on)

    rows = []
    for a in assets:
        interval = getattr(a, "service_every_days", None)
        due_on = None
        if interval:
            from_date = last_service.get(a.id) or a.purchase_date
            if from_date:
                due_on = from_date + timedelta(days=interval)
        warranty = a.warranty_until

        if not due_on and not warranty:
            continue
        soonest = min([d for d in (due_on, warranty) if d], default=None)
        if soonest and soonest > horizon:
            continue

        rows.append({
            "asset_id": a.id,
            "asset_tag": a.asset_tag,
            "name": a.name,
            "location": a.location,
            "status": a.status.value,
            "last_serviced_on": last_service.get(a.id),
            "service_every_days": interval,
            "service_due_on": due_on,
            "service_overdue": bool(due_on and due_on < today),
            "warranty_until": warranty,
            "warranty_expired": bool(warranty and warranty < today),
        })

    rows.sort(key=lambda r: (r["service_due_on"] or r["warranty_until"] or date.max))
    return {
        "within_days": within_days,
        "assets": rows,
        "count": len(rows),
        "overdue": sum(1 for r in rows if r["service_overdue"]),
        "no_interval_set": sum(
            1 for a in assets if not getattr(a, "service_every_days", None)
        ),
    }


def set_service_interval(db: Session, school_id: int, asset_id: int,
                         days: Optional[int]) -> dict:
    a = db.get(Asset, asset_id)
    if not a or a.school_id != school_id:
        raise _404("Asset")
    if days is not None and (days < 1 or days > 3650):
        raise _400("That is not a plausible service interval.")
    a.service_every_days = days
    db.commit()
    return {"asset_id": a.id, "service_every_days": a.service_every_days}


# ---------- who is on tonight ----------


def warden_rota(db: Session, school_id: int, *, frm: date, to: date) -> dict:
    """The duty roster a hostel actually runs on.

    A hostel has one warden, which says who is responsible — not who is in
    the building on Thursday. The rota is the answer to the second question,
    and without it "ring the warden" means ringing somebody at home.
    """
    from app.models.hostel_ops import WardenDuty

    rows = db.execute(
        select(WardenDuty, Hostel, User)
        .join(Hostel, Hostel.id == WardenDuty.hostel_id)
        .join(User, User.id == WardenDuty.user_id)
        .where(
            WardenDuty.school_id == school_id,
            WardenDuty.on_date >= frm,
            WardenDuty.on_date <= to,
        )
        .order_by(WardenDuty.on_date, Hostel.name)
    ).all()

    by_day: dict[date, list[dict]] = {}
    for duty, hostel, user in rows:
        by_day.setdefault(duty.on_date, []).append({
            "duty_id": duty.id,
            "hostel_id": hostel.id,
            "hostel_name": hostel.name,
            "user_id": user.id,
            "warden_name": user.full_name,
            "shift": duty.shift.value,
            "note": duty.note,
        })

    # A night with nobody on it is the thing worth seeing.
    hostels = list(db.execute(
        select(Hostel).where(Hostel.school_id == school_id)
    ).scalars())
    uncovered = []
    day = frm
    while day <= to:
        covered = {d["hostel_id"] for d in by_day.get(day, [])}
        for h in hostels:
            if h.id not in covered:
                uncovered.append({"date": day, "hostel_id": h.id, "hostel_name": h.name})
        day += timedelta(days=1)

    return {
        "from_date": frm,
        "to_date": to,
        "days": [{"date": d, "duties": v} for d, v in sorted(by_day.items())],
        "uncovered": uncovered,
        "uncovered_count": len(uncovered),
    }


# ---------- sending what was scheduled ----------


def due_notices(db: Session, school_id: Optional[int] = None) -> list[Notice]:
    """Notices whose scheduled time has passed and which nobody has sent."""
    now = datetime.now(timezone.utc)
    stmt = select(Notice).where(
        Notice.status == NoticeStatus.scheduled,
        Notice.scheduled_at.is_not(None),
        Notice.scheduled_at <= now,
    )
    if school_id:
        stmt = stmt.where(Notice.school_id == school_id)
    return list(db.execute(stmt.order_by(Notice.scheduled_at)).scalars())


def run_due(db: Session, school_id: Optional[int] = None) -> dict:
    """Send everything that is due.

    Deliberately a command somebody or something calls, not a thread this
    app starts on its own. A background scheduler inside a web process is a
    scheduler that runs once per worker and silently stops when the process
    restarts — the honest shape is a job the host runs on a timer, and a
    button so the office is never waiting on one.
    """
    from app.services import notice_service

    sent, failed = [], []
    for notice in due_notices(db, school_id):
        try:
            notice_service.send(db, notice.id, notice.school_id)
            sent.append({"notice_id": notice.id, "title": notice.title})
        except Exception as e:  # one bad notice must not stop the rest
            failed.append({"notice_id": notice.id, "title": notice.title,
                           "error": str(e)[:160]})
    return {
        "ran_at": datetime.now(timezone.utc),
        "sent": sent,
        "failed": failed,
        "sent_count": len(sent),
        "failed_count": len(failed),
    }
