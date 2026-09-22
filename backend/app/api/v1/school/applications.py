"""Admission applications: form, documents, entrance assessments, decision."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import AdmissionsWorker, CurrentUser, SchoolAdminUser, allow
from app.core.enums import ApplicationStatus, DocumentCategory, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.application import (
    AdmitIn,
    AdmitResult,
    ApplicationFunnel,
    ApplicationIn,
    ApplicationRead,
    AssessmentIn,
    AssessmentRead,
    AssessmentResultIn,
    DecideIn,
    DocumentRead,
    FeeIn,
    StatusIn,
    VerifyIn,
)
from app.services import application_service as svc


def _admissions_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.staff) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admissions access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# school admin, principal, or anyone whose roles carry admissions.manage
Admissions = AdmissionsWorker
# deciding and admitting can be delegated with the admissions.decide permission
Decider = Annotated[User, Depends(allow(UserRole.school_admin, permission="admissions.decide"))]


@router.get("", response_model=list[ApplicationRead])
def list_applications(
    current_user: Admissions,
    db: Db,
    status_: Optional[ApplicationStatus] = Query(None, alias="status"),
    search: Optional[str] = None,
    academic_year_id: Optional[int] = None,
    open_only: bool = False,
):
    items = svc.list_applications(db, current_user.school_id, status_=status_, search=search,
                                  academic_year_id=academic_year_id, open_only=open_only)
    return svc.to_read(db, items)


@router.post("", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
def create(payload: ApplicationIn, current_user: Admissions, db: Db, enquiry_id: Optional[int] = None,
           submitted: bool = False):
    a = svc.create(db, current_user.tenant_id, current_user.school_id, payload, current_user.id,
                   submitted=submitted, enquiry_id=enquiry_id)
    return svc.to_read(db, [a], with_detail=True)[0]


@router.get("/funnel", response_model=ApplicationFunnel)
def funnel(current_user: Admissions, db: Db, academic_year_id: Optional[int] = None):
    return svc.funnel(db, current_user.school_id, academic_year_id)


@router.get("/{application_id}", response_model=ApplicationRead)
def detail(application_id: int, current_user: Admissions, db: Db):
    return svc.detail(db, current_user.school_id, application_id)


@router.put("/{application_id}", response_model=ApplicationRead)
def update(application_id: int, payload: ApplicationIn, current_user: Admissions, db: Db):
    svc.update(db, current_user, application_id, payload)
    return svc.detail(db, current_user.school_id, application_id)


@router.post("/{application_id}/submit", response_model=ApplicationRead)
def submit(application_id: int, current_user: Admissions, db: Db):
    svc.submit(db, current_user, application_id, current_user.school_id)
    return svc.detail(db, current_user.school_id, application_id)


@router.post("/{application_id}/status", response_model=ApplicationRead, summary="Move it along the pipeline")
def set_status(application_id: int, payload: StatusIn, current_user: Admissions, db: Db):
    svc.set_status(db, current_user, application_id, payload.status, payload.note)
    return svc.detail(db, current_user.school_id, application_id)


@router.post("/{application_id}/decide", response_model=ApplicationRead, summary="Approve or reject")
def decide(application_id: int, payload: DecideIn, current_user: Decider, db: Db):
    svc.decide(db, current_user, application_id, payload)
    return svc.detail(db, current_user.school_id, application_id)


@router.post("/{application_id}/fee", response_model=ApplicationRead, summary="Record the admission fee")
def fee(application_id: int, payload: FeeIn, current_user: Admissions, db: Db):
    svc.record_fee(db, current_user, application_id, payload)
    return svc.detail(db, current_user.school_id, application_id)


@router.post("/{application_id}/admit", response_model=AdmitResult, summary="Create the student record")
def admit(application_id: int, payload: AdmitIn, current_user: Decider, db: Db):
    return svc.admit(db, current_user, application_id, payload)


@router.post("/{application_id}/withdraw", response_model=ApplicationRead)
def withdraw(application_id: int, current_user: Admissions, db: Db, note: Optional[str] = None):
    svc.withdraw(db, current_user, application_id, note)
    return svc.detail(db, current_user.school_id, application_id)


# ---------- documents ----------


@router.post("/{application_id}/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def add_document(
    application_id: int,
    current_user: Admissions,
    db: Db,
    file: UploadFile = File(...),
    category: DocumentCategory = Form(DocumentCategory.other),
    remark: Optional[str] = Form(None),
):
    return svc.add_document(db, current_user, application_id, category, file, remark)


@router.get("/documents/{doc_id}/file")
def download(doc_id: int, current_user: Admissions, db: Db):
    d = svc.get_document(db, doc_id, current_user.school_id)
    return Response(
        content=storage.read(d.file_key), media_type=d.content_type,
        headers={"Content-Disposition": storage.content_disposition(d.file_name)},
    )


@router.post("/documents/{doc_id}/verify", response_model=DocumentRead)
def verify(doc_id: int, payload: VerifyIn, current_user: Admissions, db: Db):
    return svc.verify_document(db, current_user, doc_id, payload.verified, payload.remark)


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: int, current_user: Admissions, db: Db):
    svc.delete_document(db, current_user, doc_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- assessments ----------


@router.post("/{application_id}/assessments", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
def schedule(application_id: int, payload: AssessmentIn, current_user: Admissions, db: Db):
    svc.schedule_assessment(db, current_user, application_id, payload)
    return svc.detail(db, current_user.school_id, application_id)


@router.put("/assessments/{assessment_id}", response_model=AssessmentRead, summary="Record the result")
def result(assessment_id: int, payload: AssessmentResultIn, current_user: Admissions, db: Db):
    t = svc.record_result(db, current_user, assessment_id, payload)
    return dict(id=t.id, kind=t.kind, scheduled_at=t.scheduled_at, venue=t.venue,
                assessor_user_id=t.assessor_user_id, assessor_name=None, max_marks=t.max_marks,
                marks_obtained=t.marks_obtained, status=t.status, passed=t.passed, remarks=t.remarks)


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(assessment_id: int, current_user: Admissions, db: Db):
    svc.delete_assessment(db, current_user, assessment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
