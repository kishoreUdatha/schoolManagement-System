"""Staff profiles, workload, qualifications, lesson observations and leaving.

Observations are readable by the admin and the principal only. A note about
how somebody taught is a conversation between two people, and the model keeps
it unshared until the observer has had it — see the model docstring.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal, SchoolAdminUser
from app.core.enums import ClearanceArea, ExitClearanceStatus
from app.database import get_db
from app.services import analytics_service, staff_ops_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class QualificationIn(BaseModel):
    qualification: str = Field(..., min_length=1, max_length=120)
    institution: Optional[str] = Field(None, max_length=200)
    year_awarded: Optional[int] = Field(None, ge=1900, le=2100)
    subject_area: Optional[str] = Field(None, max_length=120)
    document_id: Optional[int] = None


class VerifyIn(BaseModel):
    verified: bool = True


class ObservationIn(BaseModel):
    staff_id: int
    observed_on: Optional[date] = None
    class_subject_id: Optional[int] = None
    section_id: Optional[int] = None
    focus: Optional[str] = Field(None, max_length=200)
    strengths: Optional[str] = Field(None, max_length=4000)
    next_steps: Optional[str] = Field(None, max_length=4000)
    follow_up_on: Optional[date] = None
    shared_with_staff: bool = False
    # Deliberately no score, rating or grade. See the model docstring.


class ShareIn(BaseModel):
    shared: bool


class ClearanceIn(BaseModel):
    staff_id: int
    last_working_day: Optional[date] = None
    reason: Optional[str] = Field(None, max_length=2000)
    areas: Optional[list[ClearanceArea]] = None


class ClearItemIn(BaseModel):
    cleared: bool
    note: Optional[str] = Field(None, max_length=300)


class CompleteIn(BaseModel):
    deactivate: bool = True


# ----- literal paths first, so "workload" is never read as a staff id -----


@router.get("/workload", summary="Every teacher's load, counted off the timetable")
def workload(user: SchoolAdminOrPrincipal, db: Db):
    return svc.workload(db, user.school_id)


@router.get("/attendance-summary", summary="A month of staff attendance per person")
def attendance_summary(user: SchoolAdminOrPrincipal, db: Db,
                       year: int = Query(..., ge=2000, le=2100),
                       month: int = Query(..., ge=1, le=12)):
    # The analytics service already does this; there is no second version.
    return analytics_service.staff_attendance_summary(db, user.school_id, year, month)


@router.get("/observations", summary="Lesson observations")
def list_observations(user: SchoolAdminOrPrincipal, db: Db,
                      staff_id: Optional[int] = None):
    return svc.list_observations(db, user.school_id, staff_id=staff_id)


@router.post("/observations", status_code=status.HTTP_201_CREATED,
             summary="Record what was seen in a lesson — no score, by design")
def add_observation(payload: ObservationIn, user: SchoolAdminOrPrincipal, db: Db):
    return svc.add_observation(
        db, user.school_id, user.tenant_id, user.id, payload.model_dump()
    )


@router.post("/observations/{observation_id}/share",
             summary="Show it to the person it is about")
def share_observation(observation_id: int, payload: ShareIn,
                      user: SchoolAdminOrPrincipal, db: Db):
    return svc.share_observation(db, user.school_id, observation_id, payload.shared)


@router.get("/clearances", summary="Departures under way")
def list_clearances(user: SchoolAdminUser, db: Db,
                    state: Optional[ExitClearanceStatus] = None):
    return svc.list_clearances(db, user.school_id, state=state)


@router.post("/clearances", status_code=status.HTTP_201_CREATED,
             summary="Start a leaver's checklist")
def start_clearance(payload: ClearanceIn, user: SchoolAdminUser, db: Db):
    return svc.start_clearance(
        db, user.school_id, user.tenant_id, user.id, payload.staff_id,
        last_working_day=payload.last_working_day, reason=payload.reason,
        areas=payload.areas,
    )


@router.post("/clearances/items/{item_id}", summary="Sign off one area")
def clear_item(item_id: int, payload: ClearItemIn, user: SchoolAdminUser, db: Db):
    return svc.clear_item(db, user.school_id, user.id, item_id,
                          payload.cleared, payload.note)


@router.post("/clearances/{clearance_id}/complete",
             summary="Finish a departure — refused while anything is outstanding")
def complete_clearance(clearance_id: int, payload: CompleteIn,
                       user: SchoolAdminUser, db: Db):
    return svc.complete_clearance(db, user.school_id, clearance_id,
                                  deactivate=payload.deactivate)


@router.post("/clearances/{clearance_id}/cancel", summary="They are staying after all")
def cancel_clearance(clearance_id: int, user: SchoolAdminUser, db: Db):
    return svc.cancel_clearance(db, user.school_id, clearance_id)


@router.post("/qualifications/{qualification_id}/verify",
             summary="Mark a qualification as checked against its certificate")
def verify_qualification(qualification_id: int, payload: VerifyIn,
                         user: SchoolAdminUser, db: Db):
    return svc.verify_qualification(db, user.school_id, user.id,
                                    qualification_id, payload.verified)


@router.delete("/qualifications/{qualification_id}",
               status_code=status.HTTP_204_NO_CONTENT)
def delete_qualification(qualification_id: int, user: SchoolAdminUser, db: Db):
    svc.delete_qualification(db, user.school_id, qualification_id)


# ----- then the per-person paths -----


@router.get("/{staff_id}/profile", summary="One member of staff, on one screen")
def profile(staff_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return svc.profile(db, user.school_id, staff_id)


@router.get("/{staff_id}/qualifications", summary="What they are qualified to do")
def list_qualifications(staff_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return svc.list_qualifications(db, user.school_id, staff_id)


@router.post("/{staff_id}/qualifications", status_code=status.HTTP_201_CREATED)
def add_qualification(staff_id: int, payload: QualificationIn,
                      user: SchoolAdminUser, db: Db):
    return svc.add_qualification(
        db, user.school_id, user.tenant_id, staff_id, payload.model_dump()
    )


@router.get("/{staff_id}/exit", summary="This person's leaving checklist, if any")
def get_clearance(staff_id: int, user: SchoolAdminUser, db: Db):
    return svc.get_clearance(db, user.school_id, staff_id)
