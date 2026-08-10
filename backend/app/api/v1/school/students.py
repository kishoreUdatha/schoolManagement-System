from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.student import (
    StudentBulkCreate,
    StudentBulkResult,
    StudentCreate,
    StudentPromoteRequest,
    StudentPromoteResult,
    StudentRead,
    StudentUpdate,
)
from app.schemas.student_profile import StudentProfileRead
from app.services import student_profile_service, student_service


router = APIRouter()


# Headers the bulk endpoint understands. Order is the template column order.
BULK_TEMPLATE_HEADERS = ("full_name", "gender", "dob", "blood_group", "address")
# Sample rows — keep address comma-free so the row parses cleanly without quoting.
BULK_TEMPLATE_SAMPLE_ROWS = (
    ("Aarav Sharma", "male", "2018-05-12", "O+", "12 MG Road Bengaluru"),
    ("Diya Patel", "female", "2018-08-03", "A+", ""),
)


@router.get(
    "/import-template.csv",
    response_class=PlainTextResponse,
    summary="Download a sample CSV for bulk student import",
)
def import_template(_: SchoolAdminUser):
    lines = [",".join(BULK_TEMPLATE_HEADERS)]
    for row in BULK_TEMPLATE_SAMPLE_ROWS:
        lines.append(",".join(row))
    body = "\n".join(lines) + "\n"
    return PlainTextResponse(
        body,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="students_import_template.csv"'
        },
    )


@router.post(
    "",
    response_model=StudentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Admit a new student (assigns admission_no + roll_no if omitted)",
)
def create(
    payload: StudentCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = student_service.create_student(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return StudentRead.model_validate(s)


@router.get(
    "",
    response_model=PaginatedResponse[StudentRead],
    summary="List students with filters",
)
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = Query(None),
    class_id: Optional[int] = Query(None),
    section_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    items, total = student_service.list_students(
        db,
        current_user.school_id,
        academic_year_id=academic_year_id,
        class_id=class_id,
        section_id=section_id,
        status_filter=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse.build(
        items=[StudentRead.model_validate(s) for s in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{student_id}",
    response_model=StudentProfileRead,
    summary="Full student profile across attendance, behaviour, marks, homework, fees",
)
def get(
    student_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = student_profile_service.get_student_for_school(
        db, student_id, current_user.school_id
    )
    return StudentProfileRead.model_validate(
        student_profile_service.build_profile(db, s)
    )


@router.patch("/{student_id}", response_model=StudentRead)
def update(
    student_id: int,
    payload: StudentUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = student_service.update_student(
        db, student_id, current_user.school_id, payload
    )
    return StudentRead.model_validate(s)


@router.post(
    "/{student_id}/activate",
    response_model=StudentRead,
)
def activate(
    student_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = student_service.set_active(db, student_id, current_user.school_id, active=True)
    return StudentRead.model_validate(s)


@router.post(
    "/{student_id}/deactivate",
    response_model=StudentRead,
)
def deactivate(
    student_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = student_service.set_active(db, student_id, current_user.school_id, active=False)
    return StudentRead.model_validate(s)


@router.post(
    "/bulk",
    response_model=StudentBulkResult,
    summary="Bulk-create students into a single section (used for CSV import)",
)
def bulk(
    payload: StudentBulkCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    created, errors = student_service.bulk_create(
        db,
        current_user.tenant_id,
        current_user.school_id,
        payload.academic_year_id,
        payload.section_id,
        payload.students,
    )
    return StudentBulkResult(
        created=[StudentRead.model_validate(s) for s in created],
        errors=errors,
    )


@router.post(
    "/promote",
    response_model=StudentPromoteResult,
    summary="Promote students from a source section to a target section in a later year",
)
def promote(
    payload: StudentPromoteRequest,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    promoted, errors = student_service.promote_students(
        db,
        current_user.tenant_id,
        current_user.school_id,
        payload.source_section_id,
        payload.target_section_id,
        payload.student_ids,
    )
    return StudentPromoteResult(
        promoted=[StudentRead.model_validate(s) for s in promoted],
        errors=errors,
        source_section_id=payload.source_section_id,
        target_section_id=payload.target_section_id,
        target_academic_year_id=promoted[0].academic_year_id if promoted else 0,
    )
