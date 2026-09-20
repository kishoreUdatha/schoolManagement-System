"""Study material a teacher has shared with parents."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.curriculum import ResourceRead
from app.services import curriculum_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/resources", response_model=list[ResourceRead], summary="Study material for the child's class")
def child_resources(student_id: int, current_user: ParentUser, db: Db, subject_id: Optional[int] = None):
    return svc.child_resources(db, current_user, student_id, subject_id)


@router.get("/{student_id}/resources/{resource_id}/file")
def download(student_id: int, resource_id: int, current_user: ParentUser, db: Db):
    student = svc.require_linked_child(db, current_user.id, student_id)
    r = svc.download(db, resource_id, student.school_id, parent_view=True)
    return Response(
        content=storage.read(r.file_key), media_type=r.content_type or "application/octet-stream",
        headers={"Content-Disposition": storage.content_disposition(r.file_name or "resource")},
    )
