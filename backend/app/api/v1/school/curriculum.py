"""Learning outcomes and the teaching resource library."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import allow_job
from app.core.enums import ResourceKind, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.curriculum import (
    OutcomeCoverage,
    OutcomeIn,
    OutcomeRead,
    OutcomeUpdate,
    ResourceRead,
    ResourceUpdate,
)
from app.services import curriculum_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# Teaching staff, plus staff or teachers given the Academics job.
Academic = Annotated[User, Depends(allow_job(
    UserRole.school_admin, UserRole.principal, UserRole.teacher,
    permission="syllabus.manage", also=("lessonplans.review",),
))]


# ---------- learning outcomes ----------


@router.get("/learning-outcomes", response_model=list[OutcomeRead], summary="Outcomes for a class-subject")
def list_outcomes(
    current_user: Academic,
    db: Db,
    class_subject_id: int = Query(...),
    chapter_id: Optional[int] = None,
    section_id: Optional[int] = Query(None, description="Also report how far this section has met them"),
    active_only: bool = False,
):
    return svc.list_outcomes(db, current_user, class_subject_id, chapter_id, section_id, active_only)


@router.post("/learning-outcomes", response_model=OutcomeRead, status_code=status.HTTP_201_CREATED)
def create_outcome(payload: OutcomeIn, current_user: Academic, db: Db):
    o = svc.create_outcome(db, current_user, payload)
    return svc.get_outcome(db, current_user, o.id)


@router.get("/learning-outcomes/coverage", response_model=OutcomeCoverage, summary="How far a section has met the outcomes")
def coverage(current_user: Academic, db: Db, class_subject_id: int = Query(...), section_id: int = Query(...)):
    return svc.coverage(db, current_user, class_subject_id, section_id)


@router.get("/learning-outcomes/{outcome_id}", response_model=OutcomeRead)
def get_outcome(outcome_id: int, current_user: Academic, db: Db, section_id: Optional[int] = None):
    return svc.get_outcome(db, current_user, outcome_id, section_id)


@router.patch("/learning-outcomes/{outcome_id}", response_model=OutcomeRead)
def update_outcome(outcome_id: int, payload: OutcomeUpdate, current_user: Academic, db: Db):
    o = svc.update_outcome(db, current_user, outcome_id, payload)
    return svc.get_outcome(db, current_user, o.id)


@router.delete("/learning-outcomes/{outcome_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_outcome(outcome_id: int, current_user: Academic, db: Db):
    svc.delete_outcome(db, current_user, outcome_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- teaching resources ----------


@router.get("/teaching-resources", response_model=list[ResourceRead])
def list_resources(
    current_user: Academic,
    db: Db,
    class_subject_id: Optional[int] = None,
    chapter_id: Optional[int] = None,
    kind: Optional[ResourceKind] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
):
    return svc.list_resources(db, current_user, class_subject_id, chapter_id, kind, search, include_inactive)


@router.post("/teaching-resources", response_model=ResourceRead, status_code=status.HTTP_201_CREATED,
             summary="Add a file or a link")
def create_resource(
    current_user: Academic,
    db: Db,
    class_subject_id: int = Form(...),
    title: str = Form(...),
    kind: ResourceKind = Form(ResourceKind.document),
    description: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    chapter_id: Optional[int] = Form(None),
    topic_id: Optional[int] = Form(None),
    visible_to_parents: bool = Form(False),
    file: Optional[UploadFile] = File(None),
):
    return svc.create_resource(
        db, current_user, class_subject_id=class_subject_id, title=title, kind=kind, description=description,
        url=url, chapter_id=chapter_id, topic_id=topic_id, visible_to_parents=visible_to_parents, file=file,
    )


@router.get("/teaching-resources/{resource_id}", response_model=ResourceRead)
def get_resource(resource_id: int, current_user: Academic, db: Db):
    return svc.get_resource(db, current_user, resource_id)


@router.get("/teaching-resources/{resource_id}/file", summary="Download the attached file")
def download(resource_id: int, current_user: Academic, db: Db):
    r = svc.download(db, resource_id, current_user.school_id, user=current_user)
    return Response(
        content=storage.read(r.file_key), media_type=r.content_type or "application/octet-stream",
        headers={"Content-Disposition": storage.content_disposition(r.file_name or "resource")},
    )


@router.patch("/teaching-resources/{resource_id}", response_model=ResourceRead)
def update_resource(resource_id: int, payload: ResourceUpdate, current_user: Academic, db: Db):
    return svc.update_resource(db, current_user, resource_id, payload)


@router.delete("/teaching-resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(resource_id: int, current_user: Academic, db: Db):
    svc.delete_resource(db, current_user, resource_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
