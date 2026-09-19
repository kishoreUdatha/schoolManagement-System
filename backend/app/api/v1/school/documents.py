from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import SchoolAdminUser
from app.core.enums import DocumentCategory, DocumentOwner, VerificationStatus
from app.database import get_db
from app.schemas.document import DocumentRead, DocumentSummary, DocumentUpdate, DocumentVerify
from app.services import document_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/summary", response_model=DocumentSummary)
def summary(current_user: SchoolAdminUser, db: Db):
    return DocumentSummary.model_validate(svc.summary(db, current_user.school_id))


@router.get("", response_model=list[DocumentRead])
def list_(
    current_user: SchoolAdminUser,
    db: Db,
    owner_type: Optional[DocumentOwner] = Query(None),
    owner_id: Optional[int] = Query(None),
    category: Optional[DocumentCategory] = Query(None),
    verification: Optional[VerificationStatus] = Query(None),
    expiring: bool = Query(False),
):
    return [
        DocumentRead.model_validate(svc.to_read(db, d))
        for d in svc.list_(
            db,
            current_user.school_id,
            owner_type=owner_type,
            owner_id=owner_id,
            category=category,
            verification=verification,
            expiring=expiring,
        )
    ]


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def upload(
    current_user: SchoolAdminUser,
    db: Db,
    file: UploadFile = File(...),
    owner_type: DocumentOwner = Form(...),
    owner_id: Optional[int] = Form(None),
    category: DocumentCategory = Form(...),
    title: str = Form(""),
    expires_on: Optional[date] = Form(None),
    visible_to_parent: bool = Form(True),
):
    d = svc.upload(
        db,
        tenant_id=current_user.tenant_id,
        school_id=current_user.school_id,
        actor=current_user,
        owner_type=owner_type,
        owner_id=owner_id,
        category=category,
        title=title,
        file=file,
        expires_on=expires_on,
        visible_to_parent=visible_to_parent,
    )
    return DocumentRead.model_validate(svc.to_read(db, d))


@router.get("/{doc_id}/file")
def download(doc_id: int, current_user: SchoolAdminUser, db: Db):
    d = svc.get(db, doc_id, current_user.school_id)
    return Response(
        content=storage.read(d.storage_key),
        media_type=d.content_type,
        headers={"Content-Disposition": storage.content_disposition(d.original_name)},
    )


@router.patch("/{doc_id}", response_model=DocumentRead)
def update(doc_id: int, payload: DocumentUpdate, current_user: SchoolAdminUser, db: Db):
    return DocumentRead.model_validate(svc.to_read(db, svc.update(db, doc_id, current_user.school_id, payload)))


@router.post("/{doc_id}/verify", response_model=DocumentRead)
def verify(doc_id: int, payload: DocumentVerify, current_user: SchoolAdminUser, db: Db):
    d = svc.verify(db, doc_id, current_user.school_id, current_user.id, payload)
    return DocumentRead.model_validate(svc.to_read(db, d))


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(doc_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete(db, doc_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
