"""Cancelling a fee receipt entered in error: the wrong amount, the wrong
method, the wrong child.

The school admin or principal cancels at once; anyone else asks, and the
request waits under Approval requests. Cancelling takes the receipt's lines
out of the live receipts, puts what they paid back on the fees, and keeps a
copy, with the reason and who asked and approved, under cancelled receipts.
Every total built from receipts (the cash book, day close, dues, the books)
then corrects itself, and the receipt number is never handed out again.

A receipt from an online payment is not cancelled here (the money did reach
the school): it is refunded. Nor is one with a refund already raised.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import ApprovalKind, ApprovalStatus, FeeStatus, MoneyMode, RefundStatus, UserRole
from app.models.accounts import CancelledReceipt, FeeCollection
from app.models.approval import ApprovalRequest
from app.models.fee import FeeHead, StudentFee
from app.models.student import Student
from app.models.user import User

ZERO = Decimal("0")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _lines(db: Session, school_id: int, collection_id: int) -> list[FeeCollection]:
    first = db.get(FeeCollection, collection_id)
    if not first or first.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return list(db.execute(select(FeeCollection).where(
        FeeCollection.school_id == school_id, FeeCollection.receipt_no == first.receipt_no,
        FeeCollection.student_id == first.student_id,
    ).order_by(FeeCollection.id)).scalars())


def _check(db: Session, lines: list[FeeCollection]) -> None:
    if any(c.mode == MoneyMode.online for c in lines):
        raise _400("This receipt is from an online payment. The money reached the school, so refund it instead.")
    from app.models.fee_extra import Refund

    if db.execute(select(Refund.id).where(
        Refund.student_fee_id.in_([c.student_fee_id for c in lines]),
        Refund.status != RefundStatus.rejected,
    )).first():
        raise _400("A refund has been raised against this receipt's fees. Settle the refund first.")


def request(db: Session, user: User, collection_id: int, reason: str) -> dict:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise _400("Say why the receipt is being cancelled")
    lines = _lines(db, user.school_id, collection_id)
    _check(db, lines)
    if user.role in (UserRole.school_admin, UserRole.principal):
        apply(db, user.school_id, lines[0].id, reason, requested_by=user.id, approved_by=user.id)
        db.commit()
        return {"status": "cancelled", "receipt_no": lines[0].receipt_no}
    waiting = db.execute(select(ApprovalRequest.id).where(
        ApprovalRequest.school_id == user.school_id, ApprovalRequest.kind == ApprovalKind.receipt_cancel,
        ApprovalRequest.status == ApprovalStatus.pending, ApprovalRequest.payload["receipt"].astext == lines[0].receipt_no,
    )).first()
    if waiting:
        raise _400("Cancelling this receipt is already waiting for approval")
    st = db.get(Student, lines[0].student_id)
    total = sum((c.amount for c in lines), ZERO)
    db.add(ApprovalRequest(
        tenant_id=user.tenant_id, school_id=user.school_id, kind=ApprovalKind.receipt_cancel,
        status=ApprovalStatus.pending, requested_by_user_id=user.id, reason=reason,
        payload={"receipt": lines[0].receipt_no, "student": f"{st.full_name} ({st.admission_no})",
                 "amount": f"Rs {total:,.2f}", "paid_on": lines[0].collected_on.isoformat(),
                 "method": lines[0].mode.value, "receipt_ref": str(lines[0].id)},
    ))
    db.commit()
    return {"status": "requested", "receipt_no": lines[0].receipt_no}


def apply(db: Session, school_id: int, collection_id: int, reason: str, *, requested_by: Optional[int],
          approved_by: Optional[int]) -> CancelledReceipt:
    """Cancel the whole receipt (caller commits)."""
    lines = _lines(db, school_id, collection_id)
    _check(db, lines)
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(FeeHead.school_id == school_id)).all())
    kept = []
    for c in lines:
        sf = db.get(StudentFee, c.student_fee_id)
        db.refresh(sf, with_for_update=True)
        sf.amount_paid = max(sf.amount_paid - c.amount, ZERO)
        if sf.status == FeeStatus.paid and sf.amount_paid < sf.amount_due:
            sf.status = FeeStatus.pending
            sf.paid_at = None
        kept.append({"fee_id": sf.id, "fee_head": heads.get(sf.fee_head_id, ""), "period": sf.period,
                     "amount": str(c.amount)})
    first = lines[0]
    archived = CancelledReceipt(
        tenant_id=first.tenant_id, school_id=school_id, receipt_no=first.receipt_no, student_id=first.student_id,
        collected_on=first.collected_on, amount=sum((c.amount for c in lines), ZERO), mode=first.mode.value,
        reference=first.reference, collected_by_user_id=first.collected_by_user_id, lines=kept,
        reason=reason[:300], requested_by_user_id=requested_by, approved_by_user_id=approved_by,
        cancelled_at=datetime.now(timezone.utc),
    )
    db.add(archived)
    for c in lines:
        db.delete(c)
    db.flush()
    return archived


def apply_approval(db: Session, a: ApprovalRequest) -> None:
    """The principal approved a cancellation (approval_service applies it)."""
    apply(db, a.school_id, int((a.payload or {}).get("receipt_ref") or 0), a.reason or "approved cancellation",
          requested_by=a.requested_by_user_id, approved_by=a.reviewed_by_user_id)


def cancelled(db: Session, school_id: int, frm, to) -> list[dict]:
    rows = db.execute(select(CancelledReceipt).where(
        CancelledReceipt.school_id == school_id, CancelledReceipt.collected_on.between(frm, to)
    ).order_by(CancelledReceipt.cancelled_at.desc())).scalars().all()
    ids = {i for r in rows for i in (r.collected_by_user_id, r.requested_by_user_id, r.approved_by_user_id) if i}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids or {-1}))).all())
    students = {s.id: s for s in db.execute(select(Student).where(Student.id.in_({r.student_id for r in rows} or {-1}))).scalars()}
    return [{
        "id": r.id, "receipt_no": r.receipt_no, "collected_on": r.collected_on, "amount": r.amount, "mode": r.mode,
        "reference": r.reference, "student_id": r.student_id,
        "student_name": students[r.student_id].full_name if r.student_id in students else "",
        "admission_no": students[r.student_id].admission_no if r.student_id in students else "",
        "lines": r.lines, "reason": r.reason, "cancelled_at": r.cancelled_at,
        "collected_by_name": names.get(r.collected_by_user_id), "requested_by_name": names.get(r.requested_by_user_id),
        "approved_by_name": names.get(r.approved_by_user_id),
    } for r in rows]
