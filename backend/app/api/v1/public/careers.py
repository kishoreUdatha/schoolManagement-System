"""Public careers page — no login. The school shares /careers/<tenant>/<school>."""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
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
    svc.apply(db, school.tenant_id, school.id, opening_id, payload.candidate, payload.message)
    return ApplyAck(message=f"Thank you. The school will be in touch about {opening.title}.")
