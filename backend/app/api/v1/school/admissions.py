from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import AdmissionsWorker, PublicLinkReader, SchoolAdminUser
from app.core.enums import AdmissionSource, AdmissionStage
from app.database import get_db
from app.models.tenant import School, Tenant
from app.schemas.admission import (
    ActivityCreate,
    AdmissionStats,
    CampaignCreate,
    CampaignRead,
    CampaignUpdate,
    ConvertRequest,
    ConvertResult,
    EnquiryCreate,
    EnquiryDetail,
    EnquiryRead,
    EnquiryUpdate,
    StageChange,
)
from app.schemas.common import PaginatedResponse
from app.services import admission_service


router = APIRouter()


# --- Campaigns ---

@router.get("/campaigns", response_model=list[CampaignRead])
def list_campaigns(
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
    active_only: bool = Query(False),
):
    items = admission_service.list_campaigns(
        db, current_user.school_id, active_only=active_only
    )
    return [
        CampaignRead.model_validate(admission_service.campaign_to_read_dict(db, c))
        for c in items
    ]


@router.post(
    "/campaigns", response_model=CampaignRead, status_code=status.HTTP_201_CREATED
)
def create_campaign(
    payload: CampaignCreate,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    c = admission_service.create_campaign(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return CampaignRead.model_validate(admission_service.campaign_to_read_dict(db, c))


@router.patch("/campaigns/{campaign_id}", response_model=CampaignRead)
def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    c = admission_service.update_campaign(
        db, campaign_id, current_user.school_id, payload
    )
    return CampaignRead.model_validate(admission_service.campaign_to_read_dict(db, c))


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: int,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    admission_service.delete_campaign(db, campaign_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class PublicLink(BaseModel):
    tenant_code: str
    code: str


@router.get(
    "/public-link",
    response_model=PublicLink,
    summary="Codes that make up this school's public enquiry form URL",
)
def public_link(current_user: PublicLinkReader, db: Annotated[Session, Depends(get_db)]):
    school = db.get(School, current_user.school_id)
    tenant = db.get(Tenant, current_user.tenant_id)
    return PublicLink(tenant_code=tenant.code, code=school.code)


# --- Enquiries ---

@router.get("/stats", response_model=AdmissionStats)
def stats(current_user: AdmissionsWorker, db: Annotated[Session, Depends(get_db)]):
    return AdmissionStats.model_validate(
        admission_service.stats(db, current_user.school_id)
    )


@router.get(
    "/enquiries",
    response_model=PaginatedResponse[EnquiryRead],
    summary="List enquiries with filters",
)
def list_enquiries(
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
    stage: Optional[AdmissionStage] = Query(None),
    source: Optional[AdmissionSource] = Query(None),
    campaign_id: Optional[int] = Query(None),
    assigned_to_user_id: Optional[int] = Query(None),
    open_only: bool = Query(False),
    follow_up_due: bool = Query(False),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    items, total = admission_service.list_enquiries(
        db,
        current_user.school_id,
        stage=stage,
        source=source,
        campaign_id=campaign_id,
        assigned_to_user_id=assigned_to_user_id,
        open_only=open_only,
        follow_up_due=follow_up_due,
        search=search,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse.build(
        items=[
            EnquiryRead.model_validate(admission_service.enquiry_to_read_dict(db, e))
            for e in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/enquiries", response_model=EnquiryRead, status_code=status.HTTP_201_CREATED
)
def create_enquiry(
    payload: EnquiryCreate,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    e = admission_service.create_enquiry(
        db,
        current_user.tenant_id,
        current_user.school_id,
        payload,
        actor_user_id=current_user.id,
    )
    return EnquiryRead.model_validate(admission_service.enquiry_to_read_dict(db, e))


@router.get("/enquiries/{enquiry_id}", response_model=EnquiryDetail)
def get_enquiry(
    enquiry_id: int,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    e = admission_service.get_enquiry(db, enquiry_id, current_user.school_id)
    return EnquiryDetail.model_validate(admission_service.enquiry_to_detail_dict(db, e))


@router.patch("/enquiries/{enquiry_id}", response_model=EnquiryDetail)
def update_enquiry(
    enquiry_id: int,
    payload: EnquiryUpdate,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    e = admission_service.update_enquiry(
        db, enquiry_id, current_user.school_id, payload
    )
    return EnquiryDetail.model_validate(admission_service.enquiry_to_detail_dict(db, e))


@router.delete("/enquiries/{enquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enquiry(
    enquiry_id: int,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    admission_service.delete_enquiry(db, enquiry_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/enquiries/{enquiry_id}/activities", response_model=EnquiryDetail)
def add_activity(
    enquiry_id: int,
    payload: ActivityCreate,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    e = admission_service.add_activity(
        db, enquiry_id, current_user.school_id, current_user.id, payload
    )
    return EnquiryDetail.model_validate(admission_service.enquiry_to_detail_dict(db, e))


@router.post("/enquiries/{enquiry_id}/stage", response_model=EnquiryDetail)
def change_stage(
    enquiry_id: int,
    payload: StageChange,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    e = admission_service.change_stage(
        db, enquiry_id, current_user.school_id, current_user.id, payload
    )
    return EnquiryDetail.model_validate(admission_service.enquiry_to_detail_dict(db, e))


@router.post(
    "/enquiries/{enquiry_id}/convert",
    response_model=ConvertResult,
    summary="Enrol the enquiry as a student (and optionally create a parent login)",
)
def convert(
    enquiry_id: int,
    payload: ConvertRequest,
    current_user: AdmissionsWorker,
    db: Annotated[Session, Depends(get_db)],
):
    return ConvertResult.model_validate(
        admission_service.convert(
            db,
            current_user.tenant_id,
            current_user.school_id,
            enquiry_id,
            current_user.id,
            payload,
        )
    )
