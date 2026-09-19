from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import StaffUser
from app.database import get_db
from app.schemas.library import LoanRead
from app.services import library_service


router = APIRouter()


@router.get("", response_model=list[LoanRead], summary="Books I have borrowed")
def my_loans(current_user: StaffUser, db: Annotated[Session, Depends(get_db)]):
    return [LoanRead.model_validate(library_service.loan_to_read(db, l)) for l in library_service.my_loans(db, current_user.id)]
