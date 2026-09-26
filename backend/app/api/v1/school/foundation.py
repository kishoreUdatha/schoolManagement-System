"""Enrolment history, guardians, terms and departments (school admin)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, SchoolStructureReader, StaffDirectoryReader, StudentManager
from app.core.scoping import get_school_student
from app.database import get_db
from app.schemas.foundation import (
    DepartmentIn,
    DepartmentRead,
    EnrollmentRead,
    GuardianIn,
    GuardianRead,
    GuardianUpdate,
    OutcomeIn,
    PortalGrant,
    RosterRow,
    TermIn,
    TermRead,
    GuardianDirectoryRow,
)
from app.services import foundation_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


# --- Enrolment history ---

@router.get("/students/{student_id}/enrollments", response_model=list[EnrollmentRead])
def enrollments(student_id: int, current_user: StudentManager, db: Db):
    return [EnrollmentRead.model_validate(e) for e in svc.history(db, get_school_student(db, student_id, current_user.school_id))]


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentRead, summary="Correct a past year's outcome")
def set_outcome(enrollment_id: int, payload: OutcomeIn, current_user: SchoolAdminUser, db: Db):
    e = svc.set_outcome(db, enrollment_id, current_user.school_id, payload.outcome)
    s = get_school_student(db, e.student_id, current_user.school_id)
    return EnrollmentRead.model_validate(next(x for x in svc.history(db, s) if x["id"] == e.id))


@router.get("/enrollments", response_model=list[RosterRow], summary="Who was in which class in a given year")
def roster(current_user: StudentManager, db: Db, academic_year_id: int = Query(...), section_id: Optional[int] = Query(None)):
    return [RosterRow.model_validate(r) for r in svc.year_roster(db, current_user.school_id, academic_year_id, section_id)]


# --- Guardians ---

@router.get("/guardians", response_model=list[GuardianDirectoryRow],
            summary="Every family contact in the school, with or without a login")
def all_guardians(current_user: StudentManager, db: Db,
                  search: Optional[str] = Query(None),
                  has_login: Optional[bool] = Query(None, description="true = only those who can sign in")):
    return [GuardianDirectoryRow.model_validate(g) for g in svc.list_guardians(db, current_user.school_id, search=search, has_login=has_login)]



@router.get("/students/{student_id}/guardians", response_model=list[GuardianRead])
def guardians(student_id: int, current_user: StudentManager, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    return [GuardianRead.model_validate(g) for g in svc.guardians_of(db, s.id)]


@router.post("/students/{student_id}/guardians", response_model=list[GuardianRead], status_code=status.HTTP_201_CREATED)
def add_guardian(student_id: int, payload: GuardianIn, current_user: StudentManager, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    svc.add_guardian(db, s, payload)
    return [GuardianRead.model_validate(g) for g in svc.guardians_of(db, s.id)]


@router.patch("/students/{student_id}/guardians/{guardian_id}", response_model=list[GuardianRead])
def update_guardian(student_id: int, guardian_id: int, payload: GuardianUpdate, current_user: StudentManager, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    svc.update_guardian(db, s, guardian_id, payload)
    return [GuardianRead.model_validate(g) for g in svc.guardians_of(db, s.id)]


@router.delete("/students/{student_id}/guardians/{guardian_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_guardian(student_id: int, guardian_id: int, current_user: StudentManager, db: Db):
    svc.remove_guardian(db, get_school_student(db, student_id, current_user.school_id), guardian_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/students/{student_id}/guardians/{guardian_id}/portal-access", response_model=PortalGrant,
             summary="Create a parent-portal login for this guardian")
def grant_portal(student_id: int, guardian_id: int, current_user: StudentManager, db: Db):
    s = get_school_student(db, student_id, current_user.school_id)
    u, password = svc.grant_portal(db, current_user, s, guardian_id)
    return PortalGrant(user_id=u.id, email=u.email, temporary_password=password)


# --- Terms ---

@router.get("/academic-years/{year_id}/terms", response_model=list[TermRead])
def terms(year_id: int, current_user: SchoolStructureReader, db: Db):
    # read-only, like classes and subjects: a principal setting up an exam picks its term
    terms = svc.list_terms(db, current_user.school_id, year_id)
    return [TermRead.model_validate(t) for t in svc.terms_to_read(db, current_user.school_id, terms)]


@router.post("/academic-years/{year_id}/terms", response_model=TermRead, status_code=status.HTTP_201_CREATED)
def add_term(year_id: int, payload: TermIn, current_user: SchoolAdminUser, db: Db):
    t = svc.save_term(db, current_user, year_id, payload)
    return TermRead.model_validate(svc.terms_to_read(db, current_user.school_id, [t])[0])


@router.put("/academic-years/{year_id}/terms/{term_id}", response_model=TermRead)
def update_term(year_id: int, term_id: int, payload: TermIn, current_user: SchoolAdminUser, db: Db):
    t = svc.save_term(db, current_user, year_id, payload, term_id)
    return TermRead.model_validate(svc.terms_to_read(db, current_user.school_id, [t])[0])


@router.delete("/terms/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_term(term_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_term(db, current_user, term_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Departments ---

@router.get("/departments", response_model=list[DepartmentRead])
def departments(current_user: StaffDirectoryReader, db: Db):
    return [DepartmentRead.model_validate(svc.department_to_read(db, d)) for d in svc.list_departments(db, current_user.school_id)]


@router.post("/departments", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def add_department(payload: DepartmentIn, current_user: SchoolAdminUser, db: Db):
    return DepartmentRead.model_validate(svc.department_to_read(db, svc.save_department(db, current_user, payload)))


@router.post("/departments/common", summary="Add the usual school departments the school does not have yet")
def add_common_departments(current_user: SchoolAdminUser, db: Db):
    return {"added": svc.add_common_departments(db, current_user)}


@router.put("/departments/{dept_id}", response_model=DepartmentRead)
def update_department(dept_id: int, payload: DepartmentIn, current_user: SchoolAdminUser, db: Db):
    return DepartmentRead.model_validate(svc.department_to_read(db, svc.save_department(db, current_user, payload, dept_id)))
