from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import FeeCounter, FeeHeadReader, SchoolAdminOrAccountant, SchoolAdminUser
from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.fee import (
    ChargeCorrection,
    FeeHeadCreate,
    FeeHeadRead,
    FeeHeadUpdate,
    FeeStructureCreate,
    FeeStructureRead,
    FeeStructureUpdate,
    GenerateMonthlyRequest,
    GenerateResult,
    RecordPayment,
    RecordPayments,
    StudentFeeRead,
)
from app.services import fee_service


class WaiveIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=200)


class WaiverLimitIn(BaseModel):
    # None: an accountant's waivers never need approval
    waiver_approval_above: Optional[Decimal] = Field(None, ge=0)


router = APIRouter()


# ----- Fee heads -----

@router.post(
    "/heads",
    response_model=FeeHeadRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a fee head (Tuition, Transport, Admission Fee, etc.)",
)
def create_head(
    payload: FeeHeadCreate,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    h = fee_service.create_head(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return FeeHeadRead.model_validate(h)


@router.get("/heads", response_model=list[FeeHeadRead])
def list_heads(
    current_user: FeeHeadReader,
    db: Annotated[Session, Depends(get_db)],
    active_only: bool = Query(False),
):
    items = fee_service.list_heads(
        db, current_user.school_id, active_only=active_only
    )
    return [FeeHeadRead.model_validate(h) for h in items]


@router.patch("/heads/{head_id}", response_model=FeeHeadRead)
def update_head(
    head_id: int,
    payload: FeeHeadUpdate,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    h = fee_service.update_head(db, head_id, current_user.school_id, payload)
    return FeeHeadRead.model_validate(h)


@router.delete("/heads/{head_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_head(
    head_id: int,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    fee_service.delete_head(db, head_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----- Fee structures -----

def _structure_to_read(s, head) -> dict:
    return {
        "id": s.id,
        "academic_year_id": s.academic_year_id,
        "class_id": s.class_id,
        "fee_head_id": s.fee_head_id,
        "amount": s.amount,
        "due_day_of_month": s.due_day_of_month,
        "fee_head_name": head.name,
        "fee_head_code": head.code,
        "is_recurring": head.is_recurring,
    }


@router.post(
    "/structures",
    response_model=FeeStructureRead,
    status_code=status.HTTP_201_CREATED,
)
def create_structure(
    payload: FeeStructureCreate,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    s = fee_service.create_structure(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    from app.models.fee import FeeHead
    head = db.get(FeeHead, s.fee_head_id)
    return FeeStructureRead.model_validate(_structure_to_read(s, head))


@router.get(
    "/structures",
    response_model=list[FeeStructureRead],
    summary="List fee structures (filter by year and/or class)",
)
def list_structures(
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = Query(None),
    class_id: Optional[int] = Query(None),
):
    items = fee_service.list_structures(
        db,
        current_user.school_id,
        academic_year_id=academic_year_id,
        class_id=class_id,
    )
    return [
        FeeStructureRead.model_validate(_structure_to_read(s, h)) for s, h in items
    ]


class StructureNameIn(BaseModel):
    academic_year_id: int
    class_id: int
    name: Optional[str] = Field(None, max_length=160)


@router.get("/structure-names", summary="Names given to class fee structures")
def structure_names(
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = Query(None),
):
    return fee_service.structure_names(db, current_user.school_id, academic_year_id)


@router.put("/structure-names", summary="Name one class's fee structure for a year (empty name clears it)")
def set_structure_name(
    payload: StructureNameIn,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    return fee_service.set_structure_name(
        db, current_user.tenant_id, current_user.school_id, payload.academic_year_id, payload.class_id, payload.name
    )


@router.patch("/structures/{structure_id}", response_model=FeeStructureRead)
def update_structure(
    structure_id: int,
    payload: FeeStructureUpdate,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    s, h = fee_service.update_structure(
        db, structure_id, current_user.school_id, payload
    )
    return FeeStructureRead.model_validate(_structure_to_read(s, h))


@router.delete(
    "/structures/{structure_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_structure(
    structure_id: int,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    fee_service.delete_structure(db, structure_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----- Generation -----

@router.post(
    "/generate",
    response_model=GenerateResult,
    summary="Generate monthly recurring fees for a given period (YYYY-MM)",
)
def generate(
    payload: GenerateMonthlyRequest,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    result = fee_service.generate_monthly(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return GenerateResult(**result)


# ----- Student fees -----

@router.get(
    "/student-fees",
    response_model=PaginatedResponse[StudentFeeRead],
    summary="List fee records with filters",
)
def list_student_fees(
    current_user: FeeCounter,
    db: Annotated[Session, Depends(get_db)],
    student_id: Optional[int] = Query(None),
    class_id: Optional[int] = Query(None),
    section_id: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    items, total = fee_service.list_student_fees(
        db,
        current_user.school_id,
        student_id=student_id,
        class_id=class_id,
        section_id=section_id,
        period=period,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse.build(
        items=[StudentFeeRead.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/student-fees/pay",
    summary="One payment covering several of a student's fees, on one receipt",
)
def record_payments(
    payload: RecordPayments,
    current_user: FeeCounter,
    db: Annotated[Session, Depends(get_db)],
):
    return fee_service.record_payments(db, current_user.school_id, payload, current_user.id)


@router.post(
    "/student-fees/{fee_id}/record-payment",
    response_model=StudentFeeRead,
    summary="Record a payment against a fee record",
)
def record_payment(
    fee_id: int,
    payload: RecordPayment,
    current_user: FeeCounter,
    db: Annotated[Session, Depends(get_db)],
):
    data = fee_service.record_payment(
        db, fee_id, current_user.school_id, payload, current_user.id
    )
    return StudentFeeRead.model_validate(data)


@router.patch(
    "/student-fees/{fee_id}",
    response_model=StudentFeeRead,
    summary="Correct a charge raised in error, before anything is collected",
)
def correct_charge(
    fee_id: int,
    payload: ChargeCorrection,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    fee_service.check_reduction(db, current_user, fee_id, payload.amount_due)
    return StudentFeeRead.model_validate(
        fee_service.correct_charge(db, fee_id, current_user.school_id, current_user.id, payload)
    )


class PrevDueRow(BaseModel):
    admission_no: str = Field(..., max_length=40)
    amount: str = Field(..., max_length=20)
    year: Optional[str] = Field(None, max_length=12)
    note: Optional[str] = Field(None, max_length=200)


class PrevDuesIn(BaseModel):
    rows: list[PrevDueRow] = Field(..., min_length=1, max_length=2000)


@router.get("/previous-dues", summary="Unpaid dues from earlier years: entered, or carried over")
def previous_dues(current_user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)]):
    from app.services import prev_dues_service

    return prev_dues_service.report(db, current_user.school_id)


@router.post("/previous-dues", summary="Enter dues from earlier years, one row per student")
def add_previous_dues(payload: PrevDuesIn, current_user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)]):
    from app.services import prev_dues_service

    return prev_dues_service.add(db, current_user, [r.model_dump() for r in payload.rows])


@router.delete("/previous-dues/{fee_id}", status_code=204, summary="Take back an entered due typed in error")
def remove_previous_due(fee_id: int, current_user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)]):
    from app.services import prev_dues_service

    prev_dues_service.remove(db, current_user, fee_id)


@router.get("/waiver-limit", summary="Fee waivers above this need the principal or school admin")
def waiver_limit(current_user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)]):
    from app.models.tenant import School

    return {"waiver_approval_above": db.get(School, current_user.school_id).waiver_approval_above}


@router.put("/waiver-limit", summary="Set the waiver limit (school admin)")
def set_waiver_limit(payload: WaiverLimitIn, current_user: SchoolAdminUser, db: Annotated[Session, Depends(get_db)]):
    from app.models.tenant import School

    school = db.get(School, current_user.school_id)
    school.waiver_approval_above = payload.waiver_approval_above
    db.commit()
    return {"waiver_approval_above": school.waiver_approval_above}


@router.post(
    "/student-fees/{fee_id}/waive",
)
def waive(
    fee_id: int,
    payload: WaiveIn,
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    """Waived now, or sent to the principal when it is above the school's limit."""
    out = fee_service.waive_or_request(db, current_user, fee_id, payload.reason)
    if out.get("fee"):
        out["fee"] = StudentFeeRead.model_validate(out["fee"])
    return out
