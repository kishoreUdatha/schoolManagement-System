"""Public admission enquiry form — no login. The school shares a link like
/apply/<tenant_code>/<school_code> on its website or social pages; an
organization with a single school can share the short /apply/<code> instead."""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.admission import PublicEnquiryCreate, PublicSchoolInfo
from app.schemas.application import ApplicationIn, PublicApplicationAck, PublicApplicationIn
from app.services import admission_service, application_service


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

@router.post(
    "/{tenant_code}/{school_code}/applications",
    response_model=PublicApplicationAck,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a full admission application (no login)",
)
def submit_application(
    tenant_code: str,
    school_code: str,
    payload: PublicApplicationIn,
    db: Annotated[Session, Depends(get_db)],
):
    school = admission_service.resolve_public_school(db, tenant_code, school_code)
    if payload.website:  # honeypot filled in: quietly accept and drop
        return PublicApplicationAck(application_no="", message="Thank you.")
    data = ApplicationIn(**payload.model_dump(exclude={"website"}))
    a = application_service.create(db, school.tenant_id, school.id, data, None, submitted=True)
    return PublicApplicationAck(
        application_no=a.application_no,
        message=f"Thank you. Your application number is {a.application_no}; the school will be in touch.",
    )


# --- Short link: one code, for an organization with a single school ---


@router.get("/{code}", response_model=PublicSchoolInfo)
def school_info_short(code: str, db: Annotated[Session, Depends(get_db)]):
    school = admission_service.resolve_public_school(db, code)
    return PublicSchoolInfo.model_validate(admission_service.public_school_info(school))


@router.post("/{code}/enquiries", response_model=PublicEnquiryAck, status_code=status.HTTP_201_CREATED)
def submit_enquiry_short(code: str, payload: PublicEnquiryCreate, db: Annotated[Session, Depends(get_db)]):
    school = admission_service.resolve_public_school(db, code)
    admission_service.create_public_enquiry(db, school, payload)
    return PublicEnquiryAck(message=f"Thank you! {school.name} will contact you shortly.")


@router.post("/{code}/applications", response_model=PublicApplicationAck, status_code=status.HTTP_201_CREATED,
             summary="Submit a full admission application through the short link")
def submit_application_short(code: str, payload: PublicApplicationIn, db: Annotated[Session, Depends(get_db)]):
    school = admission_service.resolve_public_school(db, code)
    if payload.website:  # honeypot filled in: quietly accept and drop
        return PublicApplicationAck(application_no="", message="Thank you.")
    data = ApplicationIn(**payload.model_dump(exclude={"website"}))
    a = application_service.create(db, school.tenant_id, school.id, data, None, submitted=True)
    return PublicApplicationAck(
        application_no=a.application_no,
        message=f"Thank you. Your application number is {a.application_no}; the school will be in touch.",
    )
