from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import StaffUser
from app.database import get_db
from app.schemas.payroll import PayslipRead
from app.services import payroll_service as svc


router = APIRouter()


@router.get("", response_model=list[PayslipRead], summary="My payslips (finalized months only)")
def my_payslips(current_user: StaffUser, db: Annotated[Session, Depends(get_db)]):
    return [PayslipRead.model_validate(svc.slip_to_read(db, s, r)) for s, r in svc.my_payslips(db, current_user.id)]


@router.get("/{slip_id}/pdf")
def my_payslip_pdf(slip_id: int, current_user: StaffUser, db: Annotated[Session, Depends(get_db)]):
    slip, run = svc.get_slip(db, slip_id, user_id=current_user.id)
    content, filename = svc.payslip_pdf(db, slip, run)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
