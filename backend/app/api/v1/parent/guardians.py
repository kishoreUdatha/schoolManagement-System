"""Parents see their child's family contacts and can list extra people
allowed to collect the child (no login for those)."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.foundation import GuardianIn, GuardianRead, ParentGuardianIn
from app.services import foundation_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/guardians", response_model=list[GuardianRead])
def guardians(student_id: int, current_user: ParentUser, db: Db):
    s = svc.parent_child(db, current_user.id, student_id)
    return [GuardianRead.model_validate(g) for g in svc.guardians_of(db, s.id)]


@router.post("/{student_id}/guardians", response_model=list[GuardianRead], status_code=status.HTTP_201_CREATED)
def add_pickup_person(student_id: int, payload: ParentGuardianIn, current_user: ParentUser, db: Db):
    s = svc.parent_child(db, current_user.id, student_id)
    svc.add_guardian(db, s, GuardianIn(**payload.model_dump(), is_primary=False, lives_with_student=False))
    return [GuardianRead.model_validate(g) for g in svc.guardians_of(db, s.id)]


@router.delete("/{student_id}/guardians/{guardian_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_pickup_person(student_id: int, guardian_id: int, current_user: ParentUser, db: Db):
    s = svc.parent_child(db, current_user.id, student_id)
    g = next((x for x in svc.guardians_of(db, s.id) if x["guardian_id"] == guardian_id), None)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guardian not found")
    if g["is_primary"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ask the school office to change the primary guardian")
    svc.remove_guardian(db, s, guardian_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
