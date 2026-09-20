"""Decisions about a result that the marks don't say: withheld, grace, failed."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.deps import allow
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.result import ExamResultRead, OverrideIn, OverrideRead, OverrideUpdate
from app.services import result_override_service as svc

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# the office decides; a school can delegate it with the results permission
Decider = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="exams.approve_results"))
]


@router.get("", response_model=list[OverrideRead], summary="Results the school has decided on")
def list_overrides(current_user: Decider, db: Db, exam_id: Optional[int] = None, student_id: Optional[int] = None):
    return svc.list_for_exam(db, current_user.school_id, exam_id, student_id)


@router.post("", response_model=OverrideRead, status_code=status.HTTP_201_CREATED,
             summary="Withhold a result, pass by grace, or fail")
def create(payload: OverrideIn, current_user: Decider, db: Db):
    return svc.to_read(db, [svc.create(db, current_user, payload)])[0]


@router.get("/{override_id}", response_model=OverrideRead)
def get(override_id: int, current_user: Decider, db: Db):
    return svc.to_read(db, [svc.get(db, override_id, current_user.school_id)])[0]


@router.patch("/{override_id}", response_model=Optional[OverrideRead],
              summary="Change the decision, or set it back to normal to lift it")
def update(override_id: int, payload: OverrideUpdate, current_user: Decider, db: Db):
    o = svc.update(db, current_user, override_id, payload)
    return svc.to_read(db, [o])[0] if o else None


@router.delete("/{override_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Lift the decision")
def delete(override_id: int, current_user: Decider, db: Db):
    svc.delete(db, current_user, override_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/exams/{exam_id}/students/{student_id}", response_model=ExamResultRead,
            summary="The computed result with the decision folded in")
def result(exam_id: int, student_id: int, current_user: Decider, db: Db):
    return svc.result_for(db, current_user.school_id, exam_id, student_id)
