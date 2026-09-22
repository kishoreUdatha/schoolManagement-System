from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.homework import (
    CloseIn,
    HomeworkCreate,
    HomeworkRead,
    HomeworkUpdate,
    SubmissionRead,
    SubmissionReview,
)
from app.schemas.rubric import Marking, ScoresIn
from app.services import attachment_service, homework_service, rubric_service


router = APIRouter()


@router.post(
    "",
    response_model=HomeworkRead,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: HomeworkCreate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = homework_service.create(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return HomeworkRead.model_validate(
        homework_service._to_read_dict(db, h, viewer_id=current_user.id)
    )


@router.get(
    "",
    response_model=list[HomeworkRead],
    summary="My homework — filter by class-subject and date window",
)
def list_(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    class_subject_id: Optional[int] = Query(None),
    include_past: bool = Query(True),
    limit: int = Query(100, ge=1, le=200),
):
    items = homework_service.list_for_teacher(
        db,
        current_user.id,
        current_user.school_id,
        class_subject_id=class_subject_id,
        include_past=include_past,
        limit=limit,
    )
    return [
        HomeworkRead.model_validate(
            homework_service._to_read_dict(db, h, viewer_id=current_user.id)
        )
        for h in items
    ]


@router.get("/{homework_id}", response_model=HomeworkRead)
def get(
    homework_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = homework_service.get(db, homework_id, current_user.school_id)
    return HomeworkRead.model_validate(
        homework_service._to_read_dict(db, h, viewer_id=current_user.id)
    )


@router.patch("/{homework_id}", response_model=HomeworkRead)
def update(
    homework_id: int,
    payload: HomeworkUpdate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = homework_service.update(
        db, homework_id, current_user.school_id, current_user.id, payload
    )
    return HomeworkRead.model_validate(
        homework_service._to_read_dict(db, h, viewer_id=current_user.id)
    )


@router.delete(
    "/{homework_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete(
    homework_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    homework_service.delete(
        db, homework_id, current_user.school_id, current_user.id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Story 9.3 — Submissions ---

@router.get(
    "/{homework_id}/submissions",
    response_model=list[SubmissionRead],
    summary="List all submissions for a homework assignment",
)
def list_submissions(
    homework_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = homework_service.teacher_list_submissions(
        db, homework_id, current_user.id, current_user.school_id
    )
    return [
        SubmissionRead.model_validate(homework_service.submission_to_dict(db, s))
        for s in items
    ]


@router.patch(
    "/submissions/{submission_id}/review",
    response_model=SubmissionRead,
    summary="Approve or reject a submission and attach an optional remark",
)
def review_submission(
    submission_id: int,
    payload: SubmissionReview,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = homework_service.teacher_review_submission(
        db, submission_id, current_user.id, current_user.school_id, payload
    )
    return SubmissionRead.model_validate(homework_service.submission_to_dict(db, sub))


@router.post(
    "/{homework_id}/close",
    response_model=HomeworkRead,
    summary="Close a homework so nothing more can be submitted (or reopen it)",
)
def close(
    homework_id: int,
    payload: CloseIn,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = homework_service.close(
        db, homework_id, current_user.school_id, current_user.id, closed=payload.closed
    )
    return HomeworkRead.model_validate(
        homework_service._to_read_dict(db, h, viewer_id=current_user.id)
    )


@router.put(
    "/submissions/{submission_id}/rubric-scores",
    response_model=Marking,
    summary="Mark a submission against the homework's rubric",
)
def set_scores(
    submission_id: int,
    payload: ScoresIn,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    return rubric_service.set_scores(db, current_user, submission_id, payload.scores)


# --- Uploaded files (the attachment_url link field keeps working alongside) ---

@router.post("/{homework_id}/files", response_model=HomeworkRead,
             summary="Attach files to your homework (PDF, image or Word; up to 5)")
def add_files(
    homework_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    h = homework_service.teacher_add_files(db, homework_id, current_user, files)
    return HomeworkRead.model_validate(homework_service._to_read_dict(db, h, viewer_id=current_user.id))


@router.delete("/{homework_id}/files/{attachment_id}", response_model=HomeworkRead)
def remove_file(
    homework_id: int,
    attachment_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = homework_service.teacher_remove_file(db, homework_id, current_user, attachment_id)
    return HomeworkRead.model_validate(homework_service._to_read_dict(db, h, viewer_id=current_user.id))


@router.get("/{homework_id}/files/{attachment_id}", summary="Open a file attached to the homework")
def homework_file(
    homework_id: int,
    attachment_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = homework_service.get(db, homework_id, current_user.school_id)
    return attachment_service.file_response(attachment_service.get(db, "homework", h.id, attachment_id))


@router.get("/submissions/{submission_id}/files/{attachment_id}",
            summary="Open a file handed in, or one of your review files")
def submission_file(
    submission_id: int,
    attachment_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = homework_service.teacher_submission(db, submission_id, current_user.id, current_user.school_id)
    return attachment_service.file_response(
        attachment_service.get_any(db, homework_service.SUBMISSION_FILE_KINDS, sub.id, attachment_id)
    )


@router.post("/submissions/{submission_id}/review-files", response_model=SubmissionRead,
             summary="Attach your marked copy or feedback file to a submission")
def add_review_files(
    submission_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    sub = homework_service.teacher_add_review_files(db, submission_id, current_user, files)
    return SubmissionRead.model_validate(homework_service.submission_to_dict(db, sub))


@router.delete("/submissions/{submission_id}/review-files/{attachment_id}", response_model=SubmissionRead)
def remove_review_file(
    submission_id: int,
    attachment_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = homework_service.teacher_remove_review_file(db, submission_id, current_user, attachment_id)
    return SubmissionRead.model_validate(homework_service.submission_to_dict(db, sub))
