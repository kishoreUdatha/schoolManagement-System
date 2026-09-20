"""The backend concepts the screens reported missing.

Grouped together because each is a small thing an existing page already
wanted: interviews across applications, when an asset is next due a service,
who is on duty in a hostel tonight, and sending the notices somebody
scheduled.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal, SchoolAdminUser
from app.core.enums import DutyShift
from app.database import get_db
from app.services import ops_gaps_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class ServiceIntervalIn(BaseModel):
    service_every_days: Optional[int] = Field(None, ge=1, le=3650)


class DutyIn(BaseModel):
    hostel_id: int
    user_id: int
    on_date: date
    shift: DutyShift
    note: Optional[str] = Field(None, max_length=200)


@router.get("/interviews", summary="Every interview in a window, in one query")
def interviews(user: SchoolAdminOrPrincipal, db: Db,
               frm: date = Query(..., alias="from"), to: date = Query(...)):
    return svc.interviews(db, user.school_id, frm=frm, to=to)


@router.get("/assets/service-due", summary="Assets due a service or out of warranty")
def service_due(user: SchoolAdminOrPrincipal, db: Db,
                within_days: int = Query(60, ge=1, le=365)):
    return svc.service_due(db, user.school_id, within_days=within_days)


@router.put("/assets/{asset_id}/service-interval",
            summary="How often this asset wants servicing")
def set_interval(asset_id: int, payload: ServiceIntervalIn,
                 user: SchoolAdminUser, db: Db):
    return svc.set_service_interval(db, user.school_id, asset_id,
                                    payload.service_every_days)


@router.get("/warden-rota", summary="Who is on duty, and which nights nobody is")
def warden_rota(user: SchoolAdminOrPrincipal, db: Db,
                frm: Optional[date] = Query(None, alias="from"),
                to: Optional[date] = None):
    start = frm or date.today()
    return svc.warden_rota(db, user.school_id, frm=start, to=to or start + timedelta(days=13))


@router.post("/warden-rota", status_code=status.HTTP_201_CREATED,
             summary="Put somebody on for a night")
def add_duty(payload: DutyIn, user: SchoolAdminUser, db: Db):
    from app.models.hostel_ops import WardenDuty

    row = WardenDuty(
        tenant_id=user.tenant_id, school_id=user.school_id,
        hostel_id=payload.hostel_id, user_id=payload.user_id,
        on_date=payload.on_date, shift=payload.shift, note=payload.note,
    )
    db.add(row)
    db.commit()
    return {"duty_id": row.id}


@router.delete("/warden-rota/{duty_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Take somebody off a night")
def remove_duty(duty_id: int, user: SchoolAdminUser, db: Db):
    from app.models.hostel_ops import WardenDuty

    row = db.get(WardenDuty, duty_id)
    if row and row.school_id == user.school_id:
        db.delete(row)
        db.commit()


@router.get("/scheduled-notices", summary="Notices whose time has come")
def scheduled(user: SchoolAdminOrPrincipal, db: Db):
    rows = svc.due_notices(db, user.school_id)
    return {
        "due": [{"notice_id": n.id, "title": n.title, "scheduled_at": n.scheduled_at}
                for n in rows],
        "count": len(rows),
    }


@router.post("/scheduled-notices/run",
             summary="Send everything that is due, now")
def run_scheduled(user: SchoolAdminUser, db: Db):
    """A command rather than a thread.

    A scheduler started inside a web process runs once per worker and stops
    without telling anybody when the process restarts. This is the same job,
    callable by a cron on the host — and by a button, so the office is never
    waiting on one.
    """
    return svc.run_due(db, user.school_id)
