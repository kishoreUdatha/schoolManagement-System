from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import ParentUser
from app.core.enums import DocumentCategory, DocumentOwner
from app.core.scoping import require_linked_child
from app.database import get_db
from app.schemas.document import (
    CertificateRead,
    CertificateRequestCreate,
    DocumentRead,
    TemplateRead,
)
from app.services import certificate_service, document_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


# --- Documents ---

@router.get("/{student_id}/documents", response_model=list[DocumentRead])
def list_documents(student_id: int, current_user: ParentUser, db: Db):
    return [
        DocumentRead.model_validate(document_service.to_read(db, d))
        for d in document_service.list_for_child(db, current_user.id, student_id)
    ]


@router.post(
    "/{student_id}/documents",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document for your child (the school verifies it)",
)
def upload_document(
    student_id: int,
    current_user: ParentUser,
    db: Db,
    file: UploadFile = File(...),
    category: DocumentCategory = Form(...),
    title: str = Form(""),
):
    student = require_linked_child(db, current_user.id, student_id)
    d = document_service.upload(
        db,
        tenant_id=student.tenant_id,
        school_id=student.school_id,
        actor=current_user,
        owner_type=DocumentOwner.student,
        owner_id=student.id,
        category=category,
        title=title,
        file=file,
    )
    return DocumentRead.model_validate(document_service.to_read(db, d))


@router.get("/{student_id}/documents/{doc_id}/file")
def download_document(student_id: int, doc_id: int, current_user: ParentUser, db: Db):
    d = document_service.get_for_child(db, current_user.id, student_id, doc_id)
    return Response(
        content=storage.read(d.storage_key),
        media_type=d.content_type,
        headers={"Content-Disposition": storage.content_disposition(d.original_name)},
    )


@router.delete("/{student_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(student_id: int, doc_id: int, current_user: ParentUser, db: Db):
    document_service.parent_delete(db, current_user, student_id, doc_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Certificates ---

@router.get("/{student_id}/certificates/available", response_model=list[TemplateRead])
def requestable(student_id: int, current_user: ParentUser, db: Db):
    return [
        TemplateRead.model_validate(t)
        for t in certificate_service.parent_templates(db, current_user.id, student_id)
    ]


@router.get("/{student_id}/certificates", response_model=list[CertificateRead])
def list_certificates(student_id: int, current_user: ParentUser, db: Db):
    return [
        CertificateRead.model_validate(certificate_service.to_read(db, c))
        for c in certificate_service.parent_list(db, current_user.id, student_id)
    ]


@router.post(
    "/{student_id}/certificates",
    response_model=CertificateRead,
    status_code=status.HTTP_201_CREATED,
)
def request_certificate(
    student_id: int, payload: CertificateRequestCreate, current_user: ParentUser, db: Db
):
    c = certificate_service.parent_request(db, current_user, student_id, payload.template_id, payload.purpose)
    return CertificateRead.model_validate(certificate_service.to_read(db, c))


@router.get("/{student_id}/certificates/{cert_id}/pdf")
def certificate_pdf(student_id: int, cert_id: int, current_user: ParentUser, db: Db):
    c = certificate_service.parent_get(db, current_user.id, student_id, cert_id)
    content, filename = certificate_service.pdf(db, c)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
