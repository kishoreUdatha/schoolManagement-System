"""Public admission enquiry form — no login. The school shares a link like
/apply/<tenant_code>/<school_code> on its website or social pages."""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.admission import PublicEnquiryCreate, PublicSchoolInfo
from app.services import admission_service


router = APIRouter()


class PublicEnquiryAck(BaseModel):
    ok: bool = True
    message: str


@router.get("/{tenant_code}/{school_code}", response_model=PublicSchoolInfo)
def school_info(
    tenant_code: str,
    school_code: str,
    db: Annotated[Session, Depends(get_db)],
):
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    return PublicSchoolInfo.model_validate(admission_service.public_school_info(school))


@router.post(
    "/{tenant_code}/{school_code}/enquiries",
    response_model=PublicEnquiryAck,
    status_code=status.HTTP_201_CREATED,
)
def submit_enquiry(
    tenant_code: str,
    school_code: str,
    payload: PublicEnquiryCreate,
    db: Annotated[Session, Depends(get_db)],
):
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    admission_service.create_public_enquiry(db, school, payload)
    return PublicEnquiryAck(
        message=f"Thank you! {school.name} will contact you shortly."
    )
