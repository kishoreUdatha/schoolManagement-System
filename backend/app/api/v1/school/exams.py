from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ExamSetup, ExamStaff, ResultApprover
from app.database import get_db
from app.schemas.exam import (
    MarksWindowIn,
    ReviseIn,
    VerifyMarksIn,
    ExamCreate,
    ExamPaperCreate,
    ExamPaperRead,
    ExamPaperUpdate,
    ExamRead,
    ExamUpdate,
)
from app.services import exam_service


router = APIRouter()


# ----- Exams -----

@router.post(
    "",
    response_model=ExamRead,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: ExamCreate,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.create_exam(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


@router.get(
    "",
    response_model=list[ExamRead],
    summary="List exams (filter by academic year)",
)
def list_(
    current_user: ExamStaff,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = Query(None),
):
    items = exam_service.list_exams(
        db, current_user.school_id, academic_year_id=academic_year_id
    )
    return [
        ExamRead.model_validate(exam_service._exam_to_read_dict(db, e)) for e in items
    ]


@router.get("/{exam_id}", response_model=ExamRead)
def get(
    exam_id: int,
    current_user: ExamStaff,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.get_exam(db, exam_id, current_user.school_id)
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


@router.patch("/{exam_id}", response_model=ExamRead)
def update(
    exam_id: int,
    payload: ExamUpdate,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.update_exam(db, exam_id, current_user.school_id, payload)
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    exam_id: int,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    exam_service.delete_exam(db, exam_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{exam_id}/marks-window", response_model=ExamRead,
             summary="Open or close marks entry for this exam")
def marks_window(
    exam_id: int,
    payload: MarksWindowIn,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.set_marks_window(db, exam_id, current_user.school_id, current_user.id, payload.open)
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


@router.get("/papers/{paper_id}/marks", summary="One paper's marks, student by student, for checking")
def paper_marks(
    paper_id: int,
    current_user: ExamStaff,
    db: Annotated[Session, Depends(get_db)],
):
    return exam_service.paper_marks(db, paper_id, current_user.school_id)


@router.post("/papers/{paper_id}/verify", response_model=ExamPaperRead,
             summary="Sign off a paper's marks (not the person who entered them)")
def verify_paper(
    paper_id: int,
    payload: VerifyMarksIn,
    current_user: ResultApprover,
    db: Annotated[Session, Depends(get_db)],
):
    paper = exam_service.verify_paper(db, paper_id, current_user.school_id, current_user.id, payload.verified)
    return ExamPaperRead.model_validate(exam_service._paper_to_read_dict(db, paper))


@router.post("/{exam_id}/revise", response_model=ExamRead,
             summary="Take published results back for correction, on the record")
def revise(
    exam_id: int,
    payload: ReviseIn,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.revise(db, exam_id, current_user.school_id, current_user.id, payload.reason)
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


@router.post("/{exam_id}/publish", response_model=ExamRead,
             summary="Release results to families")
def publish(
    exam_id: int,
    # A principal is the person who answers for a result once it is out, so
    # the release is theirs to make as much as the office's. Taking it back
    # is the same decision in reverse and carries the same permission.
    current_user: ResultApprover,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.publish(db, exam_id, current_user.school_id)
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


@router.post("/{exam_id}/unpublish", response_model=ExamRead,
             summary="Take results back off the family portal")
def unpublish(
    exam_id: int,
    current_user: ResultApprover,
    db: Annotated[Session, Depends(get_db)],
):
    e = exam_service.unpublish(db, exam_id, current_user.school_id)
    return ExamRead.model_validate(exam_service._exam_to_read_dict(db, e))


# ----- Papers (nested under exam) -----

@router.post(
    "/{exam_id}/papers",
    response_model=ExamPaperRead,
    status_code=status.HTTP_201_CREATED,
)
def create_paper(
    exam_id: int,
    payload: ExamPaperCreate,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    p = exam_service.create_paper(
        db, current_user.tenant_id, current_user.school_id, exam_id, payload
    )
    return ExamPaperRead.model_validate(exam_service._paper_to_read_dict(db, p))


# Flat update/delete for papers (cleaner than nested when teacher portal uses them later)

@router.patch("/papers/{paper_id}", response_model=ExamPaperRead)
def update_paper(
    paper_id: int,
    payload: ExamPaperUpdate,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    p = exam_service.update_paper(db, paper_id, current_user.school_id, payload)
    return ExamPaperRead.model_validate(exam_service._paper_to_read_dict(db, p))


@router.delete("/papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paper(
    paper_id: int,
    current_user: ExamSetup,
    db: Annotated[Session, Depends(get_db)],
):
    exam_service.delete_paper(db, paper_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
