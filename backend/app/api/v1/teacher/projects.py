"""Story 10.1 + 10.2 — Teacher-side project endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.models.subject import ClassSubject
from app.schemas.project import (
    ProgressRead,
    ProgressReview,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)
from app.services import attachment_service, project_service


router = APIRouter()


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a project to a class-subject",
)
def create(
    payload: ProjectCreate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    p = project_service.create(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return ProjectRead.model_validate(project_service._to_read_dict(db, p))


@router.get("", response_model=list[ProjectRead])
def list_(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = project_service.list_for_teacher(db, current_user.id, current_user.school_id)
    return [ProjectRead.model_validate(project_service._to_read_dict(db, p)) for p in items]


@router.patch("/{project_id}", response_model=ProjectRead)
def update(
    project_id: int,
    payload: ProjectUpdate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    p = project_service.update(
        db, project_id, current_user.school_id, current_user.id, payload
    )
    return ProjectRead.model_validate(project_service._to_read_dict(db, p))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    project_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    project_service.delete(db, project_id, current_user.school_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{project_id}/progress",
    response_model=list[ProgressRead],
    summary="Per-student progress roster (one row per active student)",
)
def progress_roster(
    project_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    rows = project_service.teacher_progress_roster(
        db, project_id, current_user.id, current_user.school_id
    )
    return [ProgressRead.model_validate(project_service._progress_dict(db, r)) for r in rows]


@router.patch(
    "/progress/{progress_id}/review",
    response_model=ProgressRead,
    summary="Add teacher remark + rating; sets status=reviewed",
)
def review_progress(
    progress_id: int,
    payload: ProgressReview,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    pp = project_service.teacher_review(
        db, progress_id, current_user.id, current_user.school_id, payload
    )
    return ProgressRead.model_validate(project_service._progress_dict(db, pp))


# --- Uploaded files (the attachment_url link field keeps working alongside) ---

@router.post("/{project_id}/files", response_model=ProjectRead,
             summary="Attach files to your project brief (PDF, image or Word; up to 5)")
def add_files(project_id: int, current_user: TeacherUser, db: Annotated[Session, Depends(get_db)],
              files: list[UploadFile] = File(...)):
    p = project_service.teacher_add_files(db, project_id, current_user, files)
    return ProjectRead.model_validate(project_service._to_read_dict(db, p))


@router.delete("/{project_id}/files/{attachment_id}", response_model=ProjectRead)
def remove_file(project_id: int, attachment_id: int, current_user: TeacherUser,
                db: Annotated[Session, Depends(get_db)]):
    p = project_service.teacher_remove_file(db, project_id, current_user, attachment_id)
    return ProjectRead.model_validate(project_service._to_read_dict(db, p))


@router.get("/{project_id}/files/{attachment_id}", summary="Open a file on the project brief")
def project_file(project_id: int, attachment_id: int, current_user: TeacherUser,
                 db: Annotated[Session, Depends(get_db)]):
    p = project_service.get(db, project_id, current_user.school_id)
    cs = db.get(ClassSubject, p.class_subject_id)
    if p.created_by_user_id != current_user.id and (not cs or cs.teacher_user_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't teach this project's class-subject")
    return attachment_service.file_response(attachment_service.get(db, "project", p.id, attachment_id))


@router.get("/progress/{progress_id}/files/{attachment_id}", summary="Open one of the review files")
def review_file(progress_id: int, attachment_id: int, current_user: TeacherUser,
                db: Annotated[Session, Depends(get_db)]):
    pp = project_service.teacher_progress(db, progress_id, current_user.id, current_user.school_id)
    return attachment_service.file_response(attachment_service.get(db, "project_review", pp.id, attachment_id))


@router.post("/progress/{progress_id}/review-files", response_model=ProgressRead,
             summary="Attach your feedback file to a student's project")
def add_review_files(progress_id: int, current_user: TeacherUser, db: Annotated[Session, Depends(get_db)],
                     files: list[UploadFile] = File(...)):
    pp = project_service.teacher_add_review_files(db, progress_id, current_user, files)
    return ProgressRead.model_validate(project_service._progress_dict(db, pp))


@router.delete("/progress/{progress_id}/review-files/{attachment_id}", response_model=ProgressRead)
def remove_review_file(progress_id: int, attachment_id: int, current_user: TeacherUser,
                       db: Annotated[Session, Depends(get_db)]):
    pp = project_service.teacher_remove_review_file(db, progress_id, current_user, attachment_id)
    return ProgressRead.model_validate(project_service._progress_dict(db, pp))
