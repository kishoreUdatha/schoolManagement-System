"""Discipline incidents and counselling cases (school side)."""
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import CaseStatus, IncidentStatus, UserRole
from app.core.scoping import school_today
from app.database import get_db
from app.models.user import User
from app.schemas.pastoral import (
    ActionIn,
    ActionRead,
    CaseIn,
    CaseRead,
    CaseUpdate,
    DisciplineSummary,
    IncidentIn,
    IncidentRead,
    IncidentUpdate,
    InformIn,
    SessionIn,
    SessionRead,
    ShareIn,
)
from app.services import pastoral_service as svc


def _school_staff(current_user: CurrentUser) -> User:
    if current_user.role in (UserRole.parent, UserRole.student, UserRole.super_admin) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_school_staff)]


# ---------- discipline ----------


@router.get("/incidents", response_model=list[IncidentRead])
def list_incidents(
    current_user: Staff,
    db: Db,
    student_id: Optional[int] = None,
    status_: Optional[IncidentStatus] = Query(None, alias="status"),
    section_id: Optional[int] = None,
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    items = svc.list_incidents(db, current_user, student_id=student_id, status_=status_, frm=frm, to=to, section_id=section_id)
    return svc.incidents_to_read(db, current_user, items)


@router.post("/incidents", response_model=IncidentRead, status_code=status.HTTP_201_CREATED,
             summary="Report an incident (any staff member)")
def create_incident(payload: IncidentIn, current_user: Staff, db: Db):
    return svc.incidents_to_read(db, current_user, [svc.create_incident(db, current_user, payload)])[0]


@router.get("/incidents/summary", response_model=DisciplineSummary)
def summary(current_user: Staff, db: Db, frm: Optional[date] = Query(None, alias="from"), to: Optional[date] = None):
    # The school's date, not the server's. Incidents are dated with
    # school_today when they are reported and closed, so a window ending on
    # the UTC date drops today's incidents for the hours the two disagree.
    to = to or school_today(db, current_user.school_id)
    frm = frm or to - timedelta(days=90)
    return svc.discipline_summary(db, current_user, frm, to)


@router.get("/incidents/{incident_id}", response_model=IncidentRead)
def get_incident(incident_id: int, current_user: Staff, db: Db):
    return svc.incidents_to_read(db, current_user, [svc.get_incident(db, current_user, incident_id)])[0]


@router.patch("/incidents/{incident_id}", response_model=IncidentRead)
def update_incident(incident_id: int, payload: IncidentUpdate, current_user: Staff, db: Db):
    return svc.incidents_to_read(db, current_user, [svc.update_incident(db, current_user, incident_id, payload)])[0]


@router.delete("/incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_incident(incident_id: int, current_user: Staff, db: Db):
    svc.delete_incident(db, current_user, incident_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/incidents/{incident_id}/share", response_model=IncidentRead, summary="Share with the parents")
def share(incident_id: int, payload: ShareIn, current_user: Staff, db: Db):
    return svc.incidents_to_read(db, current_user, [svc.share_with_parents(db, current_user, incident_id, payload.message)])[0]


@router.post("/incidents/{incident_id}/actions", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
def add_action(incident_id: int, payload: ActionIn, current_user: Staff, db: Db):
    svc.add_action(db, current_user, incident_id, payload)
    return svc.incidents_to_read(db, current_user, [svc.get_incident(db, current_user, incident_id)])[0]


@router.delete("/actions/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_action(action_id: int, current_user: Staff, db: Db):
    svc.delete_action(db, current_user, action_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- counselling ----------


@router.get("/counselling/cases", response_model=list[CaseRead])
def list_cases(current_user: Staff, db: Db, student_id: Optional[int] = None,
               status_: Optional[CaseStatus] = Query(None, alias="status"), counsellor_user_id: Optional[int] = None):
    items = svc.list_cases(db, current_user, student_id=student_id, status_=status_, counsellor_user_id=counsellor_user_id)
    return svc.cases_to_read(db, current_user, items)


@router.post("/counselling/cases", response_model=CaseRead, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseIn, current_user: Staff, db: Db):
    return svc.cases_to_read(db, current_user, [svc.create_case(db, current_user, payload)])[0]


@router.get("/counselling/cases/{case_id}", response_model=CaseRead, summary="Case with its session notes")
def get_case(case_id: int, current_user: Staff, db: Db):
    return svc.case_detail(db, current_user, case_id)


@router.patch("/counselling/cases/{case_id}", response_model=CaseRead)
def update_case(case_id: int, payload: CaseUpdate, current_user: Staff, db: Db):
    svc.update_case(db, current_user, case_id, payload)
    return svc.case_detail(db, current_user, case_id)


@router.post("/counselling/cases/{case_id}/sessions", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def add_session(case_id: int, payload: SessionIn, current_user: Staff, db: Db):
    s = svc.add_session(db, current_user, case_id, payload)
    return dict(id=s.id, met_on=s.met_on, minutes=s.minutes, attendees=s.attendees, notes=s.notes,
                next_session_on=s.next_session_on, recorded_by_name=current_user.full_name)


@router.post("/counselling/cases/{case_id}/inform-parents", response_model=CaseRead,
             summary="Message the parents (never the notes)")
def inform(case_id: int, payload: InformIn, current_user: Staff, db: Db):
    svc.inform_parents(db, current_user, case_id, payload.message)
    return svc.case_detail(db, current_user, case_id)
