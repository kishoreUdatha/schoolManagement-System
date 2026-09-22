"""Requests to hire, and the checklist a new starter works through.

Anybody on the school admin surface can raise a request; deciding one is open
to the principal as well, since agreeing to a post is a head's call as much as
the office's. The service refuses to let either of them decide their own.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import HrManager, SchoolAdminOrPrincipal, SchoolAdminUser
from app.core.enums import OnboardingArea, RequisitionStatus
from app.database import get_db
from app.services import hr_ops_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class RequisitionIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    department_id: Optional[int] = None
    role_description: Optional[str] = Field(None, max_length=8000)
    headcount: int = Field(1, ge=1, le=200)
    reason: str = Field(..., min_length=3, max_length=8000)
    needed_by: Optional[date] = None
    status: RequisitionStatus = RequisitionStatus.draft


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=300)


class StatusIn(BaseModel):
    status: RequisitionStatus


class StartChecklistIn(BaseModel):
    due_on: Optional[date] = None


class TaskIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    area: OnboardingArea = OnboardingArea.hr
    due_on: Optional[date] = None
    note: Optional[str] = Field(None, max_length=300)


class TaskSetIn(BaseModel):
    is_done: bool
    note: Optional[str] = Field(None, max_length=300)


# ----- requisitions -----


@router.get("/requisitions", summary="Requests to hire")
def list_requisitions(user: HrManager, db: Db,
                      state: Optional[RequisitionStatus] = None):
    return svc.list_requisitions(db, user.school_id, state=state)


@router.post("/requisitions", status_code=status.HTTP_201_CREATED,
             summary="Ask for a post")
def create_requisition(payload: RequisitionIn, user: HrManager, db: Db):
    return svc.create_requisition(db, user.school_id, user.tenant_id, user.id,
                                  payload.model_dump())


@router.post("/requisitions/{requisition_id}/submit", summary="Send it for a decision")
def submit(requisition_id: int, user: HrManager, db: Db):
    return svc.submit_requisition(db, user.school_id, requisition_id)


@router.post("/requisitions/{requisition_id}/decide",
             summary="Agree or refuse — never a request you raised")
def decide(requisition_id: int, payload: DecideIn,
           user: HrManager, db: Db):
    return svc.decide_requisition(db, user.school_id, user.id, requisition_id,
                                  payload.approve, payload.note)


@router.post("/requisitions/{requisition_id}/status",
             summary="Mark it filled or cancelled")
def set_status(requisition_id: int, payload: StatusIn, user: HrManager, db: Db):
    return svc.set_requisition_status(db, user.school_id, requisition_id,
                                      payload.status)


# ----- onboarding -----
# Literal path first: "outstanding" must not be read as a staff id.


@router.get("/onboarding/outstanding", summary="Starters with something still to do")
def outstanding(user: HrManager, db: Db):
    return svc.outstanding_across_school(db, user.school_id)


@router.get("/onboarding/{staff_id}", summary="One starter's checklist")
def checklist(staff_id: int, user: HrManager, db: Db):
    return svc.checklist(db, user.school_id, staff_id)


@router.post("/onboarding/{staff_id}", status_code=status.HTTP_201_CREATED,
             summary="Start the standard checklist for a new starter")
def start(staff_id: int, payload: StartChecklistIn, user: HrManager, db: Db):
    return svc.start_checklist(db, user.school_id, staff_id, due_on=payload.due_on)


@router.post("/onboarding/{staff_id}/complete",
             summary="Sign the checklist off (every task must be ticked)")
def complete(staff_id: int, user: HrManager, db: Db):
    return svc.complete_checklist(db, user.school_id, staff_id, user.id)


@router.post("/onboarding/{staff_id}/tasks", summary="Add something to the list")
def add_task(staff_id: int, payload: TaskIn, user: HrManager, db: Db):
    return svc.add_task(db, user.school_id, staff_id, payload.model_dump())


@router.post("/onboarding/tasks/{task_id}", summary="Tick one off, or put it back")
def set_task(task_id: int, payload: TaskSetIn, user: HrManager, db: Db):
    return svc.set_task(db, user.school_id, task_id, user.id,
                        is_done=payload.is_done, note=payload.note)
