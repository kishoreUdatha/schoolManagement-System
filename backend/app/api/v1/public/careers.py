"""Public careers page — no login. The school shares /careers/<tenant>/<school>."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.core import storage
from app.database import get_db
from app.models.hr import Candidate
from app.schemas.admission import PublicSchoolInfo
from app.schemas.hr import PublicApplyIn, PublicOpening
from app.services import admission_service
from app.services import hr_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class ApplyAck(BaseModel):
    ok: bool = True
    message: str


@router.get("/{tenant_code}/{school_code}", response_model=PublicSchoolInfo)
def school_info(tenant_code: str, school_code: str, db: Db):
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    return PublicSchoolInfo.model_validate(admission_service.public_school_info(school))


@router.get("/{tenant_code}/{school_code}/openings", response_model=list[PublicOpening])
def openings(tenant_code: str, school_code: str, db: Db):
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    items = svc.list_openings(db, school.id, None, public_only=True)
    return [
        dict(id=o["id"], reference_no=o["reference_no"], title=o["title"], department_name=o["department_name"],
             employment_type=o["employment_type"], vacancies=o["vacancies"], description=o["description"],
             requirements=o["requirements"], closes_on=o["closes_on"])
        for o in svc.openings_to_read(db, items)
    ]


@router.post("/{tenant_code}/{school_code}/openings/{opening_id}/apply", response_model=ApplyAck,
             status_code=status.HTTP_201_CREATED)
def apply(tenant_code: str, school_code: str, opening_id: int, payload: PublicApplyIn, db: Db):
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    opening = svc.get_opening(db, opening_id, school.id)
    if not opening.is_public:
        raise svc._404("Opening")
    svc.apply(db, school.tenant_id, school.id, opening_id, payload.candidate, payload.message, public=True)
    return ApplyAck(message=f"Thank you. The school will be in touch about {opening.title}.")


RESUME_MAX_MB = 5


@router.post("/{tenant_code}/{school_code}/openings/{opening_id}/apply/form", response_model=ApplyAck,
             status_code=status.HTTP_201_CREATED,
             summary="Apply with a résumé: multipart, `payload` = the JSON body of …/apply, `resume` = PDF or Word, 5 MB max")
def apply_with_resume(
    tenant_code: str, school_code: str, opening_id: int, db: Db,
    payload: str = Form(..., max_length=20000),
    resume: Optional[UploadFile] = File(None),
):
    try:
        data = PublicApplyIn.model_validate_json(payload)
    except ValidationError as e:
        raise RequestValidationError(e.errors())
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    opening = svc.get_opening(db, opening_id, school.id)
    if not opening.is_public:
        raise svc._404("Opening")
    # Check the file before anything is recorded, so a refused file leaves no half-made application.
    info = None
    if resume is not None and resume.filename:
        info = storage.save_upload(school.id, "resumes", resume, allowed=storage.RESUME_TYPES, max_mb=RESUME_MAX_MB)
    try:
        a = svc.apply(db, school.tenant_id, school.id, opening_id, data.candidate, data.message, public=True)
    except Exception:
        if info:
            storage.delete(info["key"])
        raise
    if info:
        c = db.get(Candidate, a.candidate_id)
        if c.resume_key:
            # This form is public and a candidate is matched by email, so it
            # never replaces a résumé the school already holds; the office can
            # swap it from the Candidate Pool.
            storage.delete(info["key"])
        else:
            c.resume_key, c.resume_name = info["key"], info["original_name"]
            db.commit()
    return ApplyAck(message=f"Thank you. The school will be in touch about {opening.title}.")
