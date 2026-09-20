from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, FrontDeskUser, SchoolAdminUser
from app.core.enums import VisitStatus
from app.database import get_db
from app.schemas.visitor import (
    FrontDeskDashboard,
    GatePassDecision,
    GatePassIn,
    GatePassRead,
    GateVerify,
    HostDecision,
    IncidentIn,
    IncidentRead,
    IncidentUpdate,
    VisitIn,
    VisitRead,
    VisitUpdate,
)
from app.services import visitor_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class Note(BaseModel):
    note: Optional[str] = Field(None, max_length=300)


@router.get("/hosts", summary="Staff a visitor can ask for (names only)")
def hosts(current_user: FrontDeskUser, db: Db):
    from sqlalchemy import select

    from app.core.enums import UserRole
    from app.models.user import User

    rows = db.execute(
        select(User.id, User.full_name, User.role)
        .where(
            User.school_id == current_user.school_id,
            User.is_active.is_(True),
            User.role.not_in((UserRole.parent, UserRole.student, UserRole.super_admin)),
        )
        .order_by(User.full_name)
    ).all()
    return [{"user_id": i, "full_name": n, "role": r.value} for i, n, r in rows]


@router.get("/dashboard", response_model=FrontDeskDashboard)
def dashboard(current_user: FrontDeskUser, db: Db):
    return FrontDeskDashboard.model_validate(svc.dashboard(db, current_user.school_id))


# --- Visitors ---

@router.get("/visits", response_model=list[VisitRead])
def list_visits(
    current_user: FrontDeskUser,
    db: Db,
    on: Optional[date] = Query(None),
    inside_only: bool = Query(False),
    q: Optional[str] = Query(None),
):
    return [VisitRead.model_validate(svc.visit_to_read(db, v)) for v in svc.list_visits(db, current_user.school_id, on=on, inside_only=inside_only, q=q)]


@router.post("/visits", response_model=VisitRead, status_code=status.HTTP_201_CREATED,
             summary="Walk-in check-in, or pre-register when expected_at is set")
def create_visit(payload: VisitIn, current_user: FrontDeskUser, db: Db):
    v = svc.create_visit(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return VisitRead.model_validate(svc.visit_to_read(db, v))


@router.patch("/visits/{visit_id}", response_model=VisitRead,
              summary="Correct a pre-registration before the visitor arrives")
def update_visit(visit_id: int, payload: VisitUpdate, current_user: FrontDeskUser, db: Db):
    return VisitRead.model_validate(
        svc.visit_to_read(db, svc.update_visit(db, visit_id, current_user.school_id, payload))
    )


@router.post("/visits/{visit_id}/host-decision", response_model=VisitRead,
             summary="The host confirms they are expecting this visitor, or says they aren't")
def host_decision(visit_id: int, payload: HostDecision, current_user: CurrentUser, db: Db):
    return VisitRead.model_validate(
        svc.visit_to_read(db, svc.host_decision(db, visit_id, current_user, payload.approved, payload.reason))
    )


@router.post("/visits/{visit_id}/check-in", response_model=VisitRead)
def check_in(visit_id: int, current_user: FrontDeskUser, db: Db):
    return VisitRead.model_validate(svc.visit_to_read(db, svc.check_in(db, visit_id, current_user.school_id, current_user.id)))


@router.post("/visits/{visit_id}/check-out", response_model=VisitRead)
def check_out(visit_id: int, current_user: FrontDeskUser, db: Db):
    return VisitRead.model_validate(svc.visit_to_read(db, svc.check_out(db, visit_id, current_user.school_id)))


@router.post("/visits/{visit_id}/deny", response_model=VisitRead)
def deny(visit_id: int, payload: Note, current_user: FrontDeskUser, db: Db):
    v = svc.close_visit(db, visit_id, current_user.school_id, VisitStatus.denied, payload.note)
    return VisitRead.model_validate(svc.visit_to_read(db, v))


@router.post("/visits/{visit_id}/cancel", response_model=VisitRead)
def cancel(visit_id: int, payload: Note, current_user: FrontDeskUser, db: Db):
    v = svc.close_visit(db, visit_id, current_user.school_id, VisitStatus.cancelled, payload.note)
    return VisitRead.model_validate(svc.visit_to_read(db, v))


# --- Gate passes ---

@router.get("/gate-passes", response_model=list[GatePassRead])
def list_passes(current_user: FrontDeskUser, db: Db, on: Optional[date] = Query(None), pending_only: bool = Query(False)):
    # Only the office sees codes; guards verify by the code the parent shows.
    show = current_user.role.value in ("school_admin", "principal")
    return [GatePassRead.model_validate(svc.pass_to_read(db, g, show_code=show)) for g in svc.list_passes(db, current_user.school_id, on=on, pending_only=pending_only)]


@router.post("/gate-passes", response_model=GatePassRead, status_code=status.HTTP_201_CREATED)
def create_pass(payload: GatePassIn, current_user: SchoolAdminUser, db: Db):
    g = svc.create_pass(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return GatePassRead.model_validate(svc.pass_to_read(db, g))


@router.post("/gate-passes/{pass_id}/decide", response_model=GatePassRead)
def decide(pass_id: int, payload: GatePassDecision, current_user: SchoolAdminUser, db: Db):
    return GatePassRead.model_validate(svc.pass_to_read(db, svc.decide(db, pass_id, current_user.school_id, current_user.id, payload)))


@router.post("/gate-passes/verify", response_model=GatePassRead, summary="Gate: look up today's pass by the 6-digit code")
def verify(payload: GateVerify, current_user: FrontDeskUser, db: Db):
    return GatePassRead.model_validate(svc.pass_to_read(db, svc.verify_code(db, current_user.school_id, payload.code), show_code=False))


@router.post("/gate-passes/{pass_id}/release", response_model=GatePassRead)
def release(pass_id: int, current_user: FrontDeskUser, db: Db):
    g = svc.release(db, pass_id, current_user.school_id, current_user.id)
    return GatePassRead.model_validate(svc.pass_to_read(db, g, show_code=False))


# --- Incidents ---

@router.get("/incidents", response_model=list[IncidentRead])
def list_incidents(current_user: FrontDeskUser, db: Db, open_only: bool = Query(False)):
    return [IncidentRead.model_validate(svc.incident_to_read(db, i)) for i in svc.list_incidents(db, current_user.school_id, open_only=open_only)]


@router.post("/incidents", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentIn, current_user: FrontDeskUser, db: Db):
    i = svc.create_incident(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return IncidentRead.model_validate(svc.incident_to_read(db, i))


@router.patch("/incidents/{incident_id}", response_model=IncidentRead)
def update_incident(incident_id: int, payload: IncidentUpdate, current_user: SchoolAdminUser, db: Db):
    return IncidentRead.model_validate(svc.incident_to_read(db, svc.update_incident(db, incident_id, current_user.school_id, payload)))
