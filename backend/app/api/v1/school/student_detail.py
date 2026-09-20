"""The rest of a child's file, and the register of children who have left."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal
from app.database import get_db
from app.services import student_detail_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


# Literal first: "leavers" must not be read as a student id.
@router.get("/leavers", summary="Children who are no longer studying here")
def leavers(user: SchoolAdminOrPrincipal, db: Db, year_id: Optional[int] = None):
    return student_detail_service.leavers(db, user.school_id, year_id=year_id)


@router.get("/{student_id}/academic", summary="Subjects this year, and the years behind")
def academic(student_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return student_detail_service.academic(db, user.school_id, student_id)


@router.get("/{student_id}/exams", summary="Every published exam this child sat")
def exams(student_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return student_detail_service.exam_history(db, user.school_id, student_id)


@router.get("/{student_id}/family", summary="Parents, and their other children here")
def family(student_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return student_detail_service.family(db, user.school_id, student_id)
