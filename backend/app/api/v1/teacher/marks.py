from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.mark import (
    MarksSaveRequest,
    MarksSaveResult,
    MarksViewRead,
    MyPaperRead,
)
from app.services import mark_service


router = APIRouter()


@router.get(
    "/papers",
    response_model=list[MyPaperRead],
    summary="Exam papers this teacher is responsible for entering marks against",
)
def list_my_papers(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = mark_service.list_my_papers(db, current_user.id, current_user.school_id)
    return [MyPaperRead.model_validate(i) for i in items]


@router.get(
    "/papers/{paper_id}",
    response_model=MarksViewRead,
    summary="Roster + existing marks for a (paper, section) pair",
)
def view(
    paper_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
):
    data = mark_service.get_marks_view(
        db, current_user.id, current_user.school_id, paper_id, section_id
    )
    return MarksViewRead.model_validate(data)


@router.post(
    "/papers/{paper_id}/save",
    response_model=MarksSaveResult,
    summary="UPSERT marks for students in a section against this paper",
)
def save(
    paper_id: int,
    payload: MarksSaveRequest,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    result = mark_service.save_marks(
        db,
        current_user.tenant_id,
        current_user.school_id,
        current_user.id,
        paper_id,
        payload.section_id,
        payload.entries,
    )
    return MarksSaveResult.model_validate(result)


@router.post(
    "/papers/{paper_id}/mark-all-absent",
    response_model=MarksSaveResult,
    summary="Mark every unmarked student in a section as absent",
)
def mark_all_absent(
    paper_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
):
    result = mark_service.mark_all_absent(
        db,
        current_user.tenant_id,
        current_user.school_id,
        current_user.id,
        paper_id,
        section_id,
    )
    return MarksSaveResult.model_validate(result)
