"""The full admission form: its fields for a class, the school's choice of
required and hidden fields, and an admitted student's admission details."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import AdmissionsWorker, StudentRecordReader, StudentRecords
from app.database import get_db
from app.services import admission_form as svc

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class SettingsIn(BaseModel):
    # None: the school's default for every class
    class_id: Optional[int] = None
    required: list[str] = Field(default_factory=list, max_length=200)
    hidden: list[str] = Field(default_factory=list, max_length=200)


class DetailsIn(BaseModel):
    details: dict = Field(default_factory=dict)


@router.get("", summary="The admission form for a class: sections and fields, with required and hidden")
def form(user: AdmissionsWorker, db: Db, class_id: Optional[int] = None):
    return svc.form(db, user.school_id, class_id)


@router.get("/settings", summary="Required and hidden fields: the default, and each class that differs")
def settings(user: AdmissionsWorker, db: Db):
    return svc.settings(db, user.school_id)


@router.put("/settings", summary="Set the default, or one class's, required and hidden fields")
def save_settings(payload: SettingsIn, user: AdmissionsWorker, db: Db):
    return svc.save_settings(db, user, payload.class_id, payload.required, payload.hidden)


@router.delete("/settings/{class_id}", summary="A class goes back to the school's default")
def clear_class(class_id: int, user: AdmissionsWorker, db: Db):
    return svc.clear_class(db, user, class_id)


@router.get("/students/{student_id}", summary="An admitted student's full admission details")
def student_details(student_id: int, user: StudentRecordReader, db: Db):
    return svc.student_details(db, user.school_id, student_id)


@router.put("/students/{student_id}", summary="Change an admitted student's admission details")
def save_student_details(student_id: int, payload: DetailsIn, user: StudentRecords, db: Db):
    return svc.save_student_details(db, user, student_id, payload.details)
