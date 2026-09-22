from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.cover import StudentLeaveIn, StudentLeaveRead, StudentLeaveUpdate
from app.services import attachment_service
from app.services import cover_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/leaves", response_model=list[StudentLeaveRead])
def leaves(student_id: int, current_user: ParentUser, db: Db):
    return svc.leaves_to_read(db, None, svc.child_leaves(db, current_user.id, student_id))


@router.post("/{student_id}/leaves", response_model=StudentLeaveRead, status_code=status.HTTP_201_CREATED,
             summary="Apply for leave (the class teacher is notified)")
def apply(student_id: int, payload: StudentLeaveIn, current_user: ParentUser, db: Db):
    return svc.leaves_to_read(db, None, [svc.apply(db, current_user.id, student_id, payload)])[0]


@router.patch("/{student_id}/leaves/{leave_id}", response_model=StudentLeaveRead,
              summary="Change a request the school hasn't answered yet")
def update(student_id: int, leave_id: int, payload: StudentLeaveUpdate, current_user: ParentUser, db: Db):
    lv = svc.update_leave(db, current_user.id, student_id, leave_id, payload)
    return svc.leaves_to_read(db, None, [lv])[0]


@router.post("/{student_id}/leaves/{leave_id}/cancel", response_model=StudentLeaveRead)
def cancel(student_id: int, leave_id: int, current_user: ParentUser, db: Db):
    return svc.leaves_to_read(db, None, [svc.cancel(db, current_user.id, student_id, leave_id)])[0]


@router.post("/{student_id}/leaves/{leave_id}/files", response_model=StudentLeaveRead,
             status_code=status.HTTP_201_CREATED,
             summary="Attach a supporting document (PDF, image or Word; while pending)")
def add_files(student_id: int, leave_id: int, current_user: ParentUser, db: Db,
              files: list[UploadFile] = File(...)):
    lv = svc.add_leave_files(db, current_user.id, student_id, leave_id, files)
    return svc.leaves_to_read(db, None, [lv])[0]


@router.delete("/{student_id}/leaves/{leave_id}/files/{attachment_id}", response_model=StudentLeaveRead)
def remove_file(student_id: int, leave_id: int, attachment_id: int, current_user: ParentUser, db: Db):
    lv = svc.remove_leave_file(db, current_user.id, student_id, leave_id, attachment_id)
    return svc.leaves_to_read(db, None, [lv])[0]


@router.get("/{student_id}/leaves/{leave_id}/files/{attachment_id}", summary="Open a supporting document")
def open_file(student_id: int, leave_id: int, attachment_id: int, current_user: ParentUser, db: Db):
    return attachment_service.file_response(
        svc.parent_leave_file(db, current_user.id, student_id, leave_id, attachment_id)
    )
