from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import HealthStaff
from app.core.scoping import get_school_student, section_label
from app.database import get_db
from app.models.health import ClinicVisit, HealthCheckup, Immunization
from app.schemas.health import (
    ProfileRow,
    VisitUpdate,
    AlertRow,
    CheckupIn,
    CheckupRead,
    HealthDashboard,
    HealthRecord,
    ImmunizationIn,
    ImmunizationRead,
    ProfileIn,
    ProfileRead,
    VisitIn,
    VisitRead,
)
from app.services import health_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/dashboard", response_model=HealthDashboard)
def dashboard(current_user: HealthStaff, db: Db):
    return HealthDashboard.model_validate(svc.dashboard(db, current_user.school_id))


@router.get("/profiles", response_model=list[ProfileRow],
            summary="The health register: every child, and what is on file")
def profiles(
    current_user: HealthStaff,
    db: Db,
    section_id: Optional[int] = Query(None),
    with_profile_only: bool = Query(False),
    search: Optional[str] = Query(None),
):
    return svc.list_profiles(
        db, current_user.school_id, section_id=section_id,
        with_profile_only=with_profile_only, search=search,
    )


@router.get("/alerts", response_model=list[AlertRow], summary="Students with allergies, conditions or medication")
def alerts(current_user: HealthStaff, db: Db, section_id: Optional[int] = Query(None)):
    return [AlertRow.model_validate(a) for a in svc.alerts(db, current_user.school_id, section_id=section_id)]


@router.get("/immunizations-due")
def immunizations_due(current_user: HealthStaff, db: Db, within_days: int = Query(30, ge=0, le=365)):
    return [
        {
            "id": i.id,
            "student_id": s.id,
            "student_name": s.full_name,
            "section_label": section_label(db, s.section_id),
            "vaccine": i.vaccine,
            "dose": i.dose,
            "next_due_on": i.next_due_on,
        }
        for i, s in svc.immunizations_due(db, current_user.school_id, within_days)
    ]


@router.get("/visits", response_model=list[VisitRead])
def list_visits(
    current_user: HealthStaff,
    db: Db,
    on: Optional[date] = Query(None),
    student_id: Optional[int] = Query(None),
):
    return [VisitRead.model_validate(v) for v in svc.list_visits(db, current_user.school_id, on=on, student_id=student_id)]


@router.post("/visits", response_model=VisitRead, status_code=status.HTTP_201_CREATED)
def record_visit(payload: VisitIn, current_user: HealthStaff, db: Db):
    v = svc.record_visit(db, current_user.school_id, current_user.id, payload)
    return VisitRead.model_validate(svc.visit_to_read(db, v))


@router.patch("/visits/{visit_id}", response_model=VisitRead,
              summary="Fill in or correct a sick-room note")
def update_visit(visit_id: int, payload: VisitUpdate, current_user: HealthStaff, db: Db):
    return VisitRead.model_validate(
        svc.visit_to_read(db, svc.update_visit(db, visit_id, current_user.school_id, payload))
    )


@router.delete("/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(visit_id: int, current_user: HealthStaff, db: Db):
    svc.delete_row(db, ClinicVisit, visit_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/students/{student_id}", response_model=HealthRecord)
def record(student_id: int, current_user: HealthStaff, db: Db):
    return HealthRecord.model_validate(svc.health_record(db, get_school_student(db, student_id, current_user.school_id)))


@router.put("/students/{student_id}/profile", response_model=ProfileRead)
def save_profile(student_id: int, payload: ProfileIn, current_user: HealthStaff, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    p = svc.save_profile(db, s, current_user.id, payload)
    return ProfileRead.model_validate(svc.profile_to_read(db, s, p))


@router.post("/students/{student_id}/checkups", response_model=CheckupRead, status_code=status.HTTP_201_CREATED)
def add_checkup(student_id: int, payload: CheckupIn, current_user: HealthStaff, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    return CheckupRead.model_validate(svc.checkup_to_read(svc.add_checkup(db, s, current_user.id, payload)))


@router.delete("/checkups/{checkup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkup(checkup_id: int, current_user: HealthStaff, db: Db):
    svc.delete_row(db, HealthCheckup, checkup_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/students/{student_id}/immunizations", response_model=ImmunizationRead, status_code=status.HTTP_201_CREATED)
def add_immunization(student_id: int, payload: ImmunizationIn, current_user: HealthStaff, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    return ImmunizationRead.model_validate(svc.add_immunization(db, s, current_user.id, payload))


@router.delete("/immunizations/{imm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_immunization(imm_id: int, current_user: HealthStaff, db: Db):
    svc.delete_row(db, Immunization, imm_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
