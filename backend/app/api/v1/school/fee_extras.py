"""Late-fee rules and fee refunds (school admin / accountant; principal approves too)."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, SchoolAdminOrAccountant
from app.core.enums import RefundStatus, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.fee_extra import (
    ApplyLateFeesIn,
    ApplyResult,
    LateFeePreview,
    LateFeeRuleIn,
    LateFeeRuleRead,
    RefundDecideIn,
    RefundIn,
    RefundOption,
    RefundProcessIn,
    RefundRead,
)
from app.services import fee_extras_service as svc


def _finance_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.accountant, UserRole.principal) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Finance access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Finance = Annotated[User, Depends(_finance_staff)]


# ---------- late fee rules ----------


@router.get("/late-fee-rules", response_model=list[LateFeeRuleRead])
def list_rules(current_user: Finance, db: Db):
    return [svc.rule_to_read(db, r) for r in svc.list_rules(db, current_user.school_id)]


@router.post("/late-fee-rules", response_model=LateFeeRuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(payload: LateFeeRuleIn, current_user: SchoolAdminOrAccountant, db: Db):
    return svc.rule_to_read(db, svc.create_rule(db, current_user, payload))


@router.put("/late-fee-rules/{rule_id}", response_model=LateFeeRuleRead)
def update_rule(rule_id: int, payload: LateFeeRuleIn, current_user: SchoolAdminOrAccountant, db: Db):
    return svc.rule_to_read(db, svc.update_rule(db, current_user, rule_id, payload))


@router.delete("/late-fee-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, current_user: SchoolAdminOrAccountant, db: Db):
    svc.delete_rule(db, current_user, rule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/late-fees/preview", response_model=LateFeePreview, summary="What running the rules would charge")
def preview(current_user: Finance, db: Db, on: Optional[date] = None):
    return svc.preview_late_fees(db, current_user.school_id, on)


@router.post("/late-fees/apply", response_model=ApplyResult, summary="Raise / refresh late fee charges")
def apply(current_user: SchoolAdminOrAccountant, db: Db, payload: ApplyLateFeesIn = ApplyLateFeesIn()):
    return svc.apply_late_fees(db, current_user, payload.on, payload.notify_parents)


# ---------- refunds ----------


@router.get("/refunds", response_model=list[RefundRead])
def list_refunds(current_user: Finance, db: Db, status_: Optional[RefundStatus] = Query(None, alias="status"),
                 student_id: Optional[int] = None, frm: Optional[date] = Query(None, alias="from"),
                 to: Optional[date] = None):
    return svc.refunds_to_read(db, svc.list_refunds(db, current_user.school_id, status_, student_id, frm, to))


@router.get("/refunds/options/{student_id}", response_model=list[RefundOption],
            summary="Fees this student has paid that can be refunded")
def options(student_id: int, current_user: Finance, db: Db):
    return svc.student_refund_options(db, current_user.school_id, student_id)


@router.post("/refunds", response_model=RefundRead, status_code=status.HTTP_201_CREATED)
def request_refund(payload: RefundIn, current_user: SchoolAdminOrAccountant, db: Db):
    return svc.refunds_to_read(db, [svc.request_refund(db, current_user, payload)])[0]


@router.post("/refunds/{refund_id}/decide", response_model=RefundRead, summary="Approve or reject (admin/principal)")
def decide(refund_id: int, payload: RefundDecideIn, current_user: Finance, db: Db):
    return svc.refunds_to_read(db, [svc.decide_refund(db, current_user, refund_id, payload)])[0]


@router.post("/refunds/{refund_id}/process", response_model=RefundRead, summary="Record the payout")
def process(refund_id: int, payload: RefundProcessIn, current_user: SchoolAdminOrAccountant, db: Db):
    return svc.refunds_to_read(db, [svc.process_refund(db, current_user, refund_id, payload)])[0]
