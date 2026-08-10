from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.fee import StudentFeeRead
from app.services import fee_service


router = APIRouter()


@router.get(
    "/{student_id}/fees",
    response_model=list[StudentFeeRead],
    summary="Fee records for a linked child",
)
def child_fees(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = fee_service.list_child_fees(db, current_user.id, student_id)
    return [StudentFeeRead.model_validate(i) for i in items]
