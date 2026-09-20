"""Asking to hire, and settling a new starter in.

hr_service.py runs the hiring itself — openings, candidates, interviews,
offers. This is the bracket around it: the request that justifies the post,
and the checklist that makes somebody's first week work.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import Integer, func, select
from sqlalchemy.orm import Session

from app.core.enums import OnboardingArea, RequisitionStatus
from app.models.foundation import Department
from app.models.hr_ops import OnboardingTask, Requisition
from app.models.staff import Staff
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


# The set every new starter gets, so that "nobody did it" and "not needed"
# cannot look the same a fortnight later. Somebody has to tick each one, even
# if the tick means it did not apply.
STANDARD_ONBOARDING: list[tuple[OnboardingArea, str]] = [
    (OnboardingArea.hr, "Contract signed and filed"),
    (OnboardingArea.hr, "Proof of identity and right to work checked"),
    (OnboardingArea.safeguarding, "Background check completed"),
    (OnboardingArea.safeguarding, "Safeguarding induction attended"),
    (OnboardingArea.payroll, "Bank details and tax forms collected"),
    (OnboardingArea.it, "Email account and system login created"),
    (OnboardingArea.workspace, "Desk, keys and ID badge issued"),
    (OnboardingArea.library, "Library account opened"),
    (OnboardingArea.induction, "Shown round and introduced to the team"),
]


# ---------- requisitions ----------


def _requisition(db: Session, school_id: int, requisition_id: int) -> Requisition:
    r = db.get(Requisition, requisition_id)
    if not r or r.school_id != school_id:
        raise _404("Requisition")
    return r


def requisition_to_dict(db: Session, r: Requisition) -> dict:
    raised = db.get(User, r.raised_by_user_id) if r.raised_by_user_id else None
    decided = db.get(User, r.decided_by_user_id) if r.decided_by_user_id else None
    dept = db.get(Department, r.department_id) if r.department_id else None
    return {
        "id": r.id,
        "title": r.title,
        "department_id": r.department_id,
        "department_name": dept.name if dept else None,
        "role_description": r.role_description,
        "headcount": r.headcount,
        "reason": r.reason,
        "status": r.status.value,
        "raised_by_user_id": r.raised_by_user_id,
        "raised_by": raised.full_name if raised else None,
        "decided_by": decided.full_name if decided else None,
        "decided_at": r.decided_at,
        "decision_note": r.decision_note,
        "needed_by": r.needed_by,
        "created_at": r.created_at,
    }


def list_requisitions(db: Session, school_id: int, *,
                      state: Optional[RequisitionStatus] = None) -> list[dict]:
    stmt = select(Requisition).where(Requisition.school_id == school_id)
    if state:
        stmt = stmt.where(Requisition.status == state)
    rows = db.execute(stmt.order_by(Requisition.created_at.desc()).limit(200)).scalars()
    return [requisition_to_dict(db, r) for r in rows]


def create_requisition(db: Session, school_id: int, tenant_id: int, user_id: int,
                       data: dict) -> dict:
    reason = str(data.get("reason") or "").strip()
    if len(reason) < 3:
        raise _400("Say why the post is needed.")
    headcount = int(data.get("headcount") or 1)
    if headcount < 1:
        raise _400("A request to hire nobody is not a request.")
    r = Requisition(
        tenant_id=tenant_id, school_id=school_id,
        title=str(data["title"]).strip(),
        department_id=data.get("department_id"),
        role_description=data.get("role_description"),
        headcount=headcount, reason=reason,
        status=RequisitionStatus(data.get("status") or RequisitionStatus.draft.value),
        raised_by_user_id=user_id, needed_by=data.get("needed_by"),
    )
    db.add(r)
    db.commit()
    return requisition_to_dict(db, r)


def submit_requisition(db: Session, school_id: int, requisition_id: int) -> dict:
    r = _requisition(db, school_id, requisition_id)
    if r.status != RequisitionStatus.draft:
        raise _400("That has already been sent.")
    r.status = RequisitionStatus.submitted
    db.commit()
    return requisition_to_dict(db, r)


def decide_requisition(db: Session, school_id: int, user_id: int,
                       requisition_id: int, approve: bool,
                       note: Optional[str] = None) -> dict:
    """Agree or refuse — never the person who asked.

    The same rule attendance corrections use. A head of department who can
    approve their own request for three more teachers is not being asked, and
    the record of the decision is worth nothing in a budget conversation.
    """
    r = _requisition(db, school_id, requisition_id)
    if r.status not in (RequisitionStatus.submitted, RequisitionStatus.draft):
        raise _400("That has already been decided.")
    if r.raised_by_user_id == user_id:
        raise _400("Somebody else has to decide a request you raised.")

    r.status = RequisitionStatus.approved if approve else RequisitionStatus.rejected
    r.decided_by_user_id = user_id
    r.decided_at = datetime.now(timezone.utc)
    r.decision_note = note
    db.commit()
    return requisition_to_dict(db, r)


def set_requisition_status(db: Session, school_id: int, requisition_id: int,
                           new_status: RequisitionStatus) -> dict:
    """Mark a requisition filled or cancelled once hiring has moved on."""
    r = _requisition(db, school_id, requisition_id)
    if new_status not in (RequisitionStatus.filled, RequisitionStatus.cancelled):
        raise _400("Use the decide step to approve or refuse a request.")
    if new_status == RequisitionStatus.filled and r.status != RequisitionStatus.approved:
        raise _400("A post nobody approved cannot be filled.")
    r.status = new_status
    db.commit()
    return requisition_to_dict(db, r)


# ---------- onboarding ----------


def _staff(db: Session, school_id: int, staff_id: int) -> Staff:
    s = db.get(Staff, staff_id)
    if not s or s.school_id != school_id:
        raise _404("Staff member")
    return s


def task_to_dict(db: Session, t: OnboardingTask) -> dict:
    by = db.get(User, t.done_by_user_id) if t.done_by_user_id else None
    return {
        "id": t.id,
        "staff_id": t.staff_id,
        "title": t.title,
        "area": t.area.value,
        "is_done": t.is_done,
        "done_by": by.full_name if by else None,
        "done_at": t.done_at,
        "due_on": t.due_on,
        "note": t.note,
    }


def checklist(db: Session, school_id: int, staff_id: int) -> dict:
    staff = _staff(db, school_id, staff_id)
    user = db.get(User, staff.user_id)
    rows = list(db.execute(
        select(OnboardingTask)
        .where(OnboardingTask.staff_id == staff_id)
        .order_by(OnboardingTask.area, OnboardingTask.id)
    ).scalars())
    done = sum(1 for t in rows if t.is_done)
    today = date.today()
    return {
        "staff_id": staff_id,
        "employee_no": staff.employee_no,
        "full_name": user.full_name if user else None,
        "designation": staff.designation,
        "joining_date": staff.joining_date,
        "tasks": [task_to_dict(db, t) for t in rows],
        "total": len(rows),
        "done": done,
        "outstanding": len(rows) - done,
        "overdue": sum(
            1 for t in rows if not t.is_done and t.due_on and t.due_on < today
        ),
        "started": bool(rows),
        "percent": round(done / len(rows) * 100, 1) if rows else 0.0,
    }


def start_checklist(db: Session, school_id: int, staff_id: int, *,
                    due_on: Optional[date] = None) -> dict:
    """Create the standard set for a new starter.

    Every area gets a row somebody must actively tick, including the ones
    that will turn out not to apply. An empty checklist and a finished one
    are indistinguishable otherwise.
    """
    staff = _staff(db, school_id, staff_id)
    existing = db.execute(
        select(func.count(OnboardingTask.id)).where(OnboardingTask.staff_id == staff_id)
    ).scalar_one()
    if existing:
        raise _400("That person already has a checklist.")
    for area, title in STANDARD_ONBOARDING:
        db.add(OnboardingTask(
            tenant_id=staff.tenant_id, school_id=school_id, staff_id=staff_id,
            title=title, area=area, due_on=due_on,
        ))
    db.commit()
    return checklist(db, school_id, staff_id)


def add_task(db: Session, school_id: int, staff_id: int, data: dict) -> dict:
    staff = _staff(db, school_id, staff_id)
    db.add(OnboardingTask(
        tenant_id=staff.tenant_id, school_id=school_id, staff_id=staff_id,
        title=str(data["title"]).strip(),
        area=OnboardingArea(data.get("area") or OnboardingArea.hr.value),
        due_on=data.get("due_on"), note=data.get("note"),
    ))
    db.commit()
    return checklist(db, school_id, staff_id)


def set_task(db: Session, school_id: int, task_id: int, user_id: int, *,
             is_done: bool, note: Optional[str] = None) -> dict:
    t = db.get(OnboardingTask, task_id)
    if not t or t.school_id != school_id:
        raise _404("Task")
    t.is_done = is_done
    t.done_by_user_id = user_id if is_done else None
    t.done_at = datetime.now(timezone.utc) if is_done else None
    if note is not None:
        t.note = note
    db.commit()
    return checklist(db, school_id, t.staff_id)


def outstanding_across_school(db: Session, school_id: int) -> dict:
    """Every starter with something still to do, newest joiners first.

    The list exists so that a checklist nobody finished is visible from the
    HR screen rather than only from the person's own page, which nobody opens
    once they have started work.
    """
    rows = db.execute(
        select(
            OnboardingTask.staff_id,
            func.count(OnboardingTask.id),
            func.sum(func.cast(OnboardingTask.is_done, Integer)),
        )
        .where(OnboardingTask.school_id == school_id)
        .group_by(OnboardingTask.staff_id)
    ).all()

    today = date.today()
    out = []
    for staff_id, total, done in rows:
        done = int(done or 0)
        if done >= total:
            continue
        staff = db.get(Staff, staff_id)
        user = db.get(User, staff.user_id) if staff else None
        overdue = db.execute(
            select(func.count(OnboardingTask.id)).where(
                OnboardingTask.staff_id == staff_id,
                OnboardingTask.is_done.is_(False),
                OnboardingTask.due_on.is_not(None),
                OnboardingTask.due_on < today,
            )
        ).scalar_one()
        out.append({
            "staff_id": staff_id,
            "employee_no": staff.employee_no if staff else None,
            "full_name": user.full_name if user else None,
            "designation": staff.designation if staff else None,
            "joining_date": staff.joining_date if staff else None,
            "total": total,
            "done": done,
            "outstanding": total - done,
            "overdue": overdue,
            "percent": round(done / total * 100, 1) if total else 0.0,
        })
    out.sort(key=lambda r: (r["joining_date"] is None, r["joining_date"]), reverse=True)
    return {
        "starters": out,
        "count": len(out),
        "with_overdue": sum(1 for r in out if r["overdue"]),
    }
