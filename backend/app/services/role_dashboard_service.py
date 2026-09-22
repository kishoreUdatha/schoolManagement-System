"""The first screen each kind of staff member sees.

A school does not have a librarian role, a transport manager role and an HR
role — it has people, and a set of jobs somebody has been given. The RBAC
already says so: library.manage, transport.manage, hr.manage are permissions,
handed out on top of whatever someone's base role is.

So these are not separate dashboards behind separate logins. They are panels,
and a person sees the ones matching the jobs they hold. Somebody who runs the
library and the store sees both, on one screen, which is what their morning
actually looks like — rather than two portals they have to remember to check.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    ApplicationStatus,
    BoardingStatus,
    FeeStatus,
    UserRole,
)
from app.models.academic import Section
from app.models.accounts import FeeCollection
from app.models.fee import StudentFee
from app.models.inventory import InventoryItem, StockMove
from app.models.library import BookCopy, Loan
from app.models.student import Student
from app.models.transport import TransportAssignment, TransportRoute, Vehicle
from app.models.user import User
from app.services import rbac_service

ZERO = Decimal("0")


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _href(user: User, staff_path: Optional[str], office_path: str) -> Optional[str]:
    """Where this panel leads, for the person looking at it.

    A staff member sent to /school/... is bounced to the office login and
    told to sign in as somebody they are not. Several of these modules have
    no staff-side screen yet, so the panel shows its numbers with no link
    rather than a door that opens onto a login form.
    """
    if user.role in (UserRole.school_admin, UserRole.principal, UserRole.accountant):
        return office_path
    return staff_path

# ---------- the panels ----------


def _library(db: Session, school_id: int, user: User) -> dict:
    today = date.today()
    out = db.execute(
        select(func.count(Loan.id)).where(
            Loan.school_id == school_id, Loan.returned_on.is_(None), Loan.lost_on.is_(None)
        )
    ).scalar_one()
    overdue = db.execute(
        select(func.count(Loan.id)).where(
            Loan.school_id == school_id,
            Loan.returned_on.is_(None),
            Loan.lost_on.is_(None),
            Loan.due_on < today,
        )
    ).scalar_one()
    due_today = db.execute(
        select(func.count(Loan.id)).where(
            Loan.school_id == school_id, Loan.returned_on.is_(None), Loan.due_on == today
        )
    ).scalar_one()
    copies = db.execute(
        select(func.count(BookCopy.id)).where(BookCopy.school_id == school_id)
    ).scalar_one()
    return {
        "key": "library",
        "title": "Library",
        "href": _href(user, "/staff/library", "/school/library"),
        "stats": [
            {"label": "Books out", "value": out},
            {"label": "Overdue", "value": overdue, "tone": "rose" if overdue else "emerald"},
            {"label": "Due back today", "value": due_today},
            {"label": "Copies on the shelf", "value": copies},
        ],
        # The only line here that is a job rather than a number.
        "todo": f"{overdue} book(s) to chase" if overdue else None,
    }


def _transport(db: Session, school_id: int, user: User) -> dict:
    rows = db.execute(
        select(TransportRoute, Vehicle.capacity,
               func.count(TransportAssignment.id).filter(TransportAssignment.end_date.is_(None)))
        .join(Vehicle, Vehicle.id == TransportRoute.vehicle_id, isouter=True)
        .join(TransportAssignment, TransportAssignment.route_id == TransportRoute.id, isouter=True)
        .where(TransportRoute.school_id == school_id, TransportRoute.is_active.is_(True))
        .group_by(TransportRoute.id, Vehicle.capacity)
    ).all()
    riders = sum(r[2] for r in rows)
    seats = sum(r[1] or 0 for r in rows)
    over = [r[0].name for r in rows if (r[1] or 0) > 0 and r[2] > (r[1] or 0)]
    no_vehicle = [r[0].name for r in rows if r[0].vehicle_id is None]
    return {
        "key": "transport",
        "title": "Transport",
        "href": _href(user, None, "/school/transport"),
        "stats": [
            {"label": "Routes", "value": len(rows)},
            {"label": "Riders", "value": riders},
            {"label": "Seats", "value": seats or "Not set"},
            {"label": "Full", "value": f"{_pct(riders, seats)}%" if seats else "—"},
        ],
        "todo": (
            f"over capacity: {', '.join(over)}" if over
            else f"no vehicle on {', '.join(no_vehicle)}" if no_vehicle
            else None
        ),
    }


def _store(db: Session, school_id: int, user: User) -> dict:
    items = list(db.execute(
        select(InventoryItem).where(
            InventoryItem.school_id == school_id, InventoryItem.is_active.is_(True)
        )
    ).scalars())
    low = 0
    for item in items:
        on_hand = ZERO
        for kind, qty in db.execute(
            select(StockMove.kind, func.coalesce(func.sum(StockMove.qty), 0))
            .where(StockMove.item_id == item.id).group_by(StockMove.kind)
        ).all():
            on_hand += Decimal(qty) if kind.value.endswith("_in") or kind.value == "purchase" else -Decimal(qty)
        if item.reorder_level and on_hand <= Decimal(item.reorder_level):
            low += 1
    return {
        "key": "store",
        "title": "Store",
        "href": _href(user, None, "/school/inventory"),
        "stats": [
            {"label": "Items tracked", "value": len(items)},
            {"label": "At or below reorder", "value": low, "tone": "amber" if low else "emerald"},
        ],
        "todo": f"{low} item(s) to reorder" if low else None,
    }


def _admissions(db: Session, school_id: int, user: User) -> dict:
    from app.models.application import AdmissionApplication as Application

    rows = dict(db.execute(
        select(Application.status, func.count(Application.id))
        .where(Application.school_id == school_id)
        .group_by(Application.status)
    ).all())
    total = sum(rows.values())
    waiting = sum(
        n for st, n in rows.items()
        if st.value in ("submitted", "verification", "assessment", "approved", "fee_pending")
    )
    return {
        "key": "admissions",
        "title": "Admissions",
        "href": _href(user, None, "/school/applications"),
        "stats": [
            {"label": "Applications", "value": total},
            {"label": "Waiting on us", "value": waiting, "tone": "amber" if waiting else "emerald"},
            {"label": "Admitted", "value": rows.get(ApplicationStatus.admitted, 0)},
        ],
        "todo": f"{waiting} application(s) waiting on a decision" if waiting else None,
    }


def _hr(db: Session, school_id: int, user: User) -> dict:
    from app.core.enums import StaffLeaveStatus
    from app.models.staff_leave import StaffLeave

    staff = db.execute(
        select(func.count(User.id)).where(
            User.school_id == school_id,
            User.is_active.is_(True),
            User.role.in_([UserRole.teacher, UserRole.staff, UserRole.principal, UserRole.accountant]),
        )
    ).scalar_one()
    pending = db.execute(
        select(func.count(StaffLeave.id)).where(
            StaffLeave.school_id == school_id, StaffLeave.status == StaffLeaveStatus.pending
        )
    ).scalar_one()
    return {
        "key": "hr",
        "title": "Staff and leave",
        "href": _href(user, None, "/school/staff-leaves"),
        "stats": [
            {"label": "Staff", "value": staff},
            {"label": "Leave to decide", "value": pending, "tone": "amber" if pending else "emerald"},
        ],
        "todo": f"{pending} leave request(s) to decide" if pending else None,
    }


def _hostel(db: Session, school_id: int, user: User) -> dict:
    from app.models.hostel import HostelAllocation, HostelBed

    beds = db.execute(
        select(func.count(HostelBed.id))
    ).scalar_one()
    taken = db.execute(
        select(func.count(HostelAllocation.id)).where(
            HostelAllocation.school_id == school_id, HostelAllocation.end_date.is_(None)
        )
    ).scalar_one()
    return {
        "key": "hostel",
        "title": "Hostel",
        "href": _href(user, "/staff/hostel", "/school/hostel"),
        "stats": [
            {"label": "Beds", "value": beds},
            {"label": "Occupied", "value": taken},
            {"label": "Free", "value": max(beds - taken, 0)},
        ],
        "todo": None,
    }


def _front_desk(db: Session, school_id: int, user: User) -> dict:
    from app.models.visitor import Visit

    today = date.today()
    inside = db.execute(
        select(func.count(Visit.id)).where(
            Visit.school_id == school_id, Visit.check_out_at.is_(None)
        )
    ).scalar_one()
    return {
        "key": "front_desk",
        "title": "Front desk",
        "href": _href(user, "/staff/front-desk", "/school/front-desk"),
        "stats": [{"label": "Visitors still in the building", "value": inside}],
        "todo": f"{inside} visitor(s) not signed out" if inside else None,
    }


PANELS = {
    "library.manage": _library,
    "transport.manage": _transport,
    "inventory.manage": _store,
    "admissions.manage": _admissions,
    "hr.manage": _hr,
    "hostel.manage": _hostel,
    "frontdesk.manage": _front_desk,
}


# ---------- six months of each job, for the dashboard chart ----------


def _trend(db: Session, key: str, school_id: int) -> Optional[dict]:
    """The one monthly count that best shows each job's workload."""
    from app.models.application import AdmissionApplication
    from app.models.hostel import HostelAllocation
    from app.models.staff_leave import StaffLeave
    from app.models.transport import Trip, TripBoarding
    from app.models.visitor import Visit
    from app.services.insight_service import monthly_counts

    if key == "library":
        return {"label": "Books issued", "months": monthly_counts(db, Loan.issued_on, Loan.school_id == school_id)}
    if key == "transport":
        return {"label": "Students boarded", "months": monthly_counts(
            db, TripBoarding.marked_at,
            TripBoarding.trip_id.in_(select(Trip.id).where(Trip.school_id == school_id)),
            TripBoarding.status == BoardingStatus.boarded,
        )}
    if key == "store":
        return {"label": "Stock movements", "months": monthly_counts(db, StockMove.moved_on, StockMove.school_id == school_id)}
    if key == "admissions":
        return {"label": "Applications received", "months": monthly_counts(
            db, AdmissionApplication.created_at, AdmissionApplication.school_id == school_id)}
    if key == "hr":
        return {"label": "Leave requests", "months": monthly_counts(db, StaffLeave.created_at, StaffLeave.school_id == school_id)}
    if key == "hostel":
        return {"label": "Hostel admissions", "months": monthly_counts(
            db, HostelAllocation.start_date, HostelAllocation.school_id == school_id)}
    if key == "front_desk":
        return {"label": "Visitors", "months": monthly_counts(db, Visit.check_in_at, Visit.school_id == school_id)}
    return None


def staff_dashboard(db: Session, user: User) -> dict:
    """Whichever panels this person's permissions entitle them to.

    A school admin holds every permission, so they would see all seven. That
    is not a dashboard, it is a wall — the admin already has their own, so
    they get the same list here without it pretending to be their home.
    """
    held = rbac_service.permissions_for(db, user)
    panels = []
    for code, build in PANELS.items():
        if code in held:
            try:
                panel = build(db, user.school_id, user)
            except Exception:
                # A panel whose module has no data yet must not take the whole
                # screen down with it.
                continue
            try:
                panel["trend"] = _trend(db, panel["key"], user.school_id)
            except Exception:
                db.rollback()
                panel["trend"] = None
            panels.append(panel)
    return {
        "name": user.full_name,
        "role": user.role.value,
        "panels": panels,
        "jobs": [p["todo"] for p in panels if p["todo"]],
        "nothing_assigned": not panels,
    }


# ---------- the accountant's own ----------


def accountant_dashboard(db: Session, school_id: int) -> dict:
    """Money in, money owed, and what needs a decision today."""
    today = date.today()
    month_start = today.replace(day=1)

    collected_today = db.execute(
        select(func.coalesce(func.sum(FeeCollection.amount), 0)).where(
            FeeCollection.school_id == school_id, FeeCollection.collected_on == today
        )
    ).scalar_one()
    collected_month = db.execute(
        select(func.coalesce(func.sum(FeeCollection.amount), 0)).where(
            FeeCollection.school_id == school_id, FeeCollection.collected_on >= month_start
        )
    ).scalar_one()
    receipts_today = db.execute(
        select(func.count(FeeCollection.id)).where(
            FeeCollection.school_id == school_id, FeeCollection.collected_on == today
        )
    ).scalar_one()

    unpaid = list(db.execute(
        select(StudentFee).where(
            StudentFee.school_id == school_id,
            StudentFee.status.notin_([FeeStatus.paid, FeeStatus.waived]),
        )
    ).scalars())
    outstanding = sum(
        (Decimal(f.amount_due) - Decimal(f.amount_paid or 0)) for f in unpaid
    ) or ZERO
    overdue = sum(
        (Decimal(f.amount_due) - Decimal(f.amount_paid or 0))
        for f in unpaid if f.due_date and f.due_date < today
    ) or ZERO
    families = len({f.student_id for f in unpaid})

    # the six months behind the headline, so it reads as a trend not a snapshot
    by_month = db.execute(
        select(
            func.to_char(FeeCollection.collected_on, "YYYY-MM").label("m"),
            func.coalesce(func.sum(FeeCollection.amount), 0),
        )
        .where(
            FeeCollection.school_id == school_id,
            FeeCollection.collected_on >= (month_start - timedelta(days=170)),
        )
        .group_by("m").order_by("m")
    ).all()

    return {
        "collected_today": Decimal(collected_today),
        "receipts_today": receipts_today,
        "collected_this_month": Decimal(collected_month),
        "outstanding": outstanding,
        "overdue": overdue,
        "families_owing": families,
        "by_month": [{"month": m, "amount": Decimal(v)} for m, v in by_month],
    }
