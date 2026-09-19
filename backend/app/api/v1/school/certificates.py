from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.core.enums import CertificateKind, CertificateStatus
from app.database import get_db
from app.schemas.document import (
    CertificateCancel,
    CertificateDecision,
    CertificateIssueCreate,
    CertificateRead,
    PreviewRead,
    TemplateCreate,
    TemplateRead,
    TemplateUpdate,
)
from app.services import certificate_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/placeholders", response_model=dict[str, str])
def placeholders(_: SchoolAdminUser):
    return svc.PLACEHOLDERS


@router.get("/templates", response_model=list[TemplateRead])
def list_templates(current_user: SchoolAdminUser, db: Db):
    return [
        TemplateRead.model_validate(t)
        for t in svc.list_templates(db, current_user.tenant_id, current_user.school_id)
    ]


@router.post("/templates", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateCreate, current_user: SchoolAdminUser, db: Db):
    return TemplateRead.model_validate(
        svc.create_template(db, current_user.tenant_id, current_user.school_id, payload)
    )


@router.patch("/templates/{template_id}", response_model=TemplateRead)
def update_template(template_id: int, payload: TemplateUpdate, current_user: SchoolAdminUser, db: Db):
    return TemplateRead.model_validate(
        svc.update_template(db, template_id, current_user.school_id, payload)
    )


@router.post("/preview", response_model=PreviewRead)
def preview(payload: CertificateIssueCreate, current_user: SchoolAdminUser, db: Db):
    return PreviewRead.model_validate(svc.preview(db, current_user.school_id, payload))


@router.get("", response_model=list[CertificateRead], summary="Certificate register (and pending requests)")
def list_(
    current_user: SchoolAdminUser,
    db: Db,
    status_filter: Optional[CertificateStatus] = Query(None, alias="status"),
    kind: Optional[CertificateKind] = Query(None),
    student_id: Optional[int] = Query(None),
):
    return [
        CertificateRead.model_validate(svc.to_read(db, c))
        for c in svc.list_(db, current_user.school_id, status_=status_filter, kind=kind, student_id=student_id)
    ]


@router.post("", response_model=CertificateRead, status_code=status.HTTP_201_CREATED)
def issue(payload: CertificateIssueCreate, current_user: SchoolAdminUser, db: Db):
    c = svc.issue(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return CertificateRead.model_validate(svc.to_read(db, c))


@router.post("/{cert_id}/decide", response_model=CertificateRead, summary="Issue or reject a parent's request")
def decide(cert_id: int, payload: CertificateDecision, current_user: SchoolAdminUser, db: Db):
    c = svc.decide(db, cert_id, current_user.school_id, current_user.id, payload)
    return CertificateRead.model_validate(svc.to_read(db, c))


@router.post("/{cert_id}/cancel", response_model=CertificateRead)
def cancel(cert_id: int, payload: CertificateCancel, current_user: SchoolAdminUser, db: Db):
    c = svc.cancel(db, cert_id, current_user.school_id, current_user.id, payload.reason)
    return CertificateRead.model_validate(svc.to_read(db, c))


@router.get("/{cert_id}/pdf")
def pdf(cert_id: int, current_user: SchoolAdminUser, db: Db):
    content, filename = svc.pdf(db, svc.get(db, cert_id, current_user.school_id))
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
