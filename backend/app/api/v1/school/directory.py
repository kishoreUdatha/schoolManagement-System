"""Name look-ups for pickers in every staff portal (store counter, front desk,
library desk, hostel). Returns only what a picker needs — no contact details."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import UserRole
from app.core.scoping import section_labels
from app.database import get_db
from app.models.student import Student
from app.models.user import User


def _school_staff(current_user: CurrentUser) -> User:
    if current_user.role in (UserRole.parent, UserRole.student, UserRole.super_admin) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return current_user


router = APIRouter()
Staff = Annotated[User, Depends(_school_staff)]
Db = Annotated[Session, Depends(get_db)]


@router.get("/students")
def students(current_user: Staff, db: Db, search: str = Query(..., min_length=2), limit: int = Query(10, ge=1, le=50)):
    like = f"%{search.strip()}%"
    rows = list(
        db.execute(
            select(Student)
            .where(
                Student.school_id == current_user.school_id,
                Student.is_active.is_(True),
                or_(Student.full_name.ilike(like), Student.admission_no.ilike(like)),
            )
            .order_by(Student.full_name)
            .limit(limit)
        ).scalars()
    )
    labels = section_labels(db, {s.section_id for s in rows})
    return [
        {"id": s.id, "full_name": s.full_name, "admission_no": s.admission_no, "section_label": labels.get(s.section_id)}
        for s in rows
    ]


@router.get("/staff")
def staff(current_user: Staff, db: Db, search: Optional[str] = Query(None)):
    stmt = select(User.id, User.full_name, User.role).where(
        User.school_id == current_user.school_id,
        User.is_active.is_(True),
        User.role.not_in((UserRole.parent, UserRole.student, UserRole.super_admin)),
    )
    if search:
        stmt = stmt.where(User.full_name.ilike(f"%{search.strip()}%"))
    return [{"user_id": i, "full_name": n, "role": r.value} for i, n, r in db.execute(stmt.order_by(User.full_name)).all()]
