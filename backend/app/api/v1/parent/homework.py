from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.homework import (
    HomeworkRead,
    SubmissionCreate,
    SubmissionRead,
    SubmissionUpdate,
)
from app.services import attachment_service, homework_service


router = APIRouter()


@router.get(
    "/{student_id}/homework",
    response_model=list[HomeworkRead],
    summary="Homework for a linked child's class (read-only)",
)
def child_homework(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = homework_service.list_for_child(db, current_user.id, student_id)
    return [
        HomeworkRead.model_validate(homework_service._to_read_dict(db, h))
        for h in items
    ]


# --- Story 9.3 — Submissions ---

@router.get(
    "/{student_id}/homework/{homework_id}/submission",
    response_model=Optional[SubmissionRead],
    summary="Current submission for this homework (null if not submitted yet)",
)
def get_submission(
    student_id: int,
    homework_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = homework_service.parent_get_submission(
        db, current_user.id, student_id, homework_id
    )
    if not sub:
        return None
    return SubmissionRead.model_validate(homework_service.submission_to_dict(db, sub))


@router.post(
    "/{student_id}/homework/{homework_id}/submission",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit homework (creates or replaces existing submission)",
)
def create_submission(
    student_id: int,
    homework_id: int,
    payload: SubmissionCreate,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = homework_service.parent_submit(
        db, current_user.id, student_id, homework_id, payload
    )
    return SubmissionRead.model_validate(
        homework_service.submission_to_dict(db, sub)
    )


@router.patch(
    "/{student_id}/homework/{homework_id}/submission",
    response_model=SubmissionRead,
    summary="Edit existing submission (resets teacher review)",
)
def update_submission(
    student_id: int,
    homework_id: int,
    payload: SubmissionUpdate,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = homework_service.parent_edit_submission(
        db, current_user.id, student_id, homework_id, payload
    )
    return SubmissionRead.model_validate(
        homework_service.submission_to_dict(db, sub)
    )


# --- Uploaded files ---

@router.get(
    "/{student_id}/homework/{homework_id}/files/{attachment_id}",
    summary="Open a file: the teacher's worksheet, the work handed in, or the teacher's review file",
)
def open_file(
    student_id: int,
    homework_id: int,
    attachment_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    student = homework_service._verify_parent_owns_child(db, current_user.id, student_id)
    return attachment_service.file_response(
        homework_service.student_file(db, student, homework_id, attachment_id)
    )


@router.post(
    "/{student_id}/homework/{homework_id}/submission/files",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Hand in files (PDF, image or Word, up to 5); starts the submission if needed",
)
def add_submission_files(
    student_id: int,
    homework_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    student = homework_service._verify_parent_owns_child(db, current_user.id, student_id)
    sub = homework_service.add_submission_files(db, student, homework_id, files, by_user_id=current_user.id)
    return SubmissionRead.model_validate(homework_service.submission_to_dict(db, sub))


@router.delete(
    "/{student_id}/homework/{homework_id}/submission/files/{attachment_id}",
    response_model=SubmissionRead,
)
def remove_submission_file(
    student_id: int,
    homework_id: int,
    attachment_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    student = homework_service._verify_parent_owns_child(db, current_user.id, student_id)
    sub = homework_service.remove_submission_file(
        db, student, homework_id, attachment_id, by_user_id=current_user.id
    )
    return SubmissionRead.model_validate(homework_service.submission_to_dict(db, sub))
