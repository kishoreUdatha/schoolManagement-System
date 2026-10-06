from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, StaffDirectoryReader, StaffManager, StaffRecordReader
from app.core.enums import UserRole
from app.database import get_db
from app.schemas.staff import (
    StaffCreate,
    StaffCreateResponse,
    StaffPasswordResetResponse,
    StaffRead,
    StaffUpdate,
)
from app.services import staff_service


router = APIRouter()

# roles a staff-records job holder may add or edit (the office roles stay the school admin's)
JOB_MANAGED = ("teacher", "staff")


def _may_manage(user, role) -> None:
    role = getattr(role, "value", role)
    if user.role != UserRole.school_admin and role not in JOB_MANAGED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the school admin can add or change this role")


@router.post(
    "",
    response_model=StaffCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a staff member (teacher or non-teaching) — returns temp password",
)
def create(
    payload: StaffCreate,
    current_user: StaffManager,
    db: Annotated[Session, Depends(get_db)],
):
    _may_manage(current_user, payload.role)
    staff, raw_password = staff_service.create_staff(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return StaffCreateResponse(
        staff=StaffRead.model_validate(staff_service.staff_to_read_dict(staff)),
        temporary_password=raw_password,
    )


@router.get(
    "",
    response_model=list[StaffRead],
    summary="List staff with filters (role / designation / status / search)",
)
def list_(
    current_user: StaffDirectoryReader,
    db: Annotated[Session, Depends(get_db)],
    role: Optional[str] = Query(None, description="'teacher' or 'staff'"),
    designation: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(
        None, alias="status", description="'active' or 'inactive'"
    ),
    search: Optional[str] = Query(None),
):
    items = staff_service.list_staff(
        db,
        current_user.school_id,
        role=role,
        designation=designation,
        status_filter=status_filter,
        search=search,
    )
    return [
        StaffRead.model_validate(staff_service.staff_to_read_dict(s)) for s in items
    ]


@router.get(
    "/next-employee-no",
    summary="The employee number the next staff member will get",
)
def next_employee_no(
    # whoever may see the staff directory: HR suggests it on an offer letter
    current_user: StaffDirectoryReader,
    db: Annotated[Session, Depends(get_db)],
):
    return {"employee_no": staff_service.next_employee_no(db, current_user.school_id)}


@router.get("/{staff_id}", response_model=StaffRead)
def get(
    staff_id: int,
    current_user: StaffRecordReader,
    db: Annotated[Session, Depends(get_db)],
):
    s = staff_service.get_staff(db, staff_id, current_user.school_id)
    return StaffRead.model_validate(staff_service.staff_to_read_dict(s))


@router.patch("/{staff_id}", response_model=StaffRead)
def update(
    staff_id: int,
    payload: StaffUpdate,
    current_user: StaffManager,
    db: Annotated[Session, Depends(get_db)],
):
    _may_manage(current_user, staff_service.staff_to_read_dict(
        staff_service.get_staff(db, staff_id, current_user.school_id))["role"])
    s = staff_service.update_staff(db, staff_id, current_user.school_id, payload)
    return StaffRead.model_validate(staff_service.staff_to_read_dict(s))


@router.post(
    "/{staff_id}/activate",
    response_model=StaffRead,
    summary="Reactivate a deactivated staff member (re-enables login)",
)
def activate(
    staff_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = staff_service.set_active(db, staff_id, current_user.school_id, active=True)
    return StaffRead.model_validate(staff_service.staff_to_read_dict(s))


@router.post(
    "/{staff_id}/deactivate",
    response_model=StaffRead,
    summary="Deactivate staff (locks login, keeps history)",
)
def deactivate(
    staff_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = staff_service.set_active(db, staff_id, current_user.school_id, active=False)
    return StaffRead.model_validate(staff_service.staff_to_read_dict(s))


@router.post(
    "/{staff_id}/reset-password",
    response_model=StaffPasswordResetResponse,
    summary="Generate a new temporary password",
)
def reset_password(
    staff_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s, raw = staff_service.reset_password(db, staff_id, current_user.school_id)
    return StaffPasswordResetResponse(user_id=s.user_id, temporary_password=raw)
