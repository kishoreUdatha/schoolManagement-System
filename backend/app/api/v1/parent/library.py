from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.library import LoanRead
from app.services import library_service


router = APIRouter()


@router.get("/{student_id}/library", response_model=list[LoanRead], summary="Books borrowed by your child")
def child_loans(student_id: int, current_user: ParentUser, db: Annotated[Session, Depends(get_db)]):
    return [
        LoanRead.model_validate(library_service.loan_to_read(db, l))
        for l in library_service.child_loans(db, current_user.id, student_id)
    ]
