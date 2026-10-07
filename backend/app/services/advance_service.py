"""Money a student's family has paid beyond what is due, and using it.

An advance is collected like a fee, against the built-in fee type "Advance /
excess paid" (code ADVANCE): a fee raised and paid in the same breath, so it
sits on the receipt beside the fees it came with, and the cash book, day
close and receipts list all count it. In the books it is a liability, Fees
received in advance (Fees receivable Dr / Advances Cr when raised, then the
cash receipt), not income.

Using an advance pays a later fee from it with no new money: an AdvanceUse
row (Advances Dr / Fees receivable Cr). The balance is what was paid in as
advance less what has been used.

Moving a payment to another student (a sibling, a mix-up) cancels the
receipt on the first child (receipt_cancel_service) and records the same
money, same day and method, on the second child's unpaid fees, oldest first,
with any rest as their advance.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ApprovalKind, ApprovalStatus, FeeStatus, MoneyMode, UserRole
from app.models.accounts import AdvanceUse, FeeCollection
from app.models.approval import ApprovalRequest
from app.models.fee import FeeHead, StudentFee
from app.models.student import Student
from app.models.user import User

CODE = "ADVANCE"
ZERO = Decimal("0")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def head(db: Session, tenant_id: int, school_id: int) -> FeeHead:
    h = db.execute(select(FeeHead).where(FeeHead.school_id == school_id, FeeHead.code == CODE)).scalars().first()
    if h is None:
        h = FeeHead(tenant_id=tenant_id, school_id=school_id, name="Advance / excess paid", code=CODE,
                    is_recurring=False, is_active=True)
        db.add(h)
        db.flush()
    return h


def add_advance(db: Session, *, tenant_id: int, school_id: int, student_id: int, amount: Decimal, mode: MoneyMode,
                on: date, reference: Optional[str], actor_id: Optional[int], note: Optional[str],
                receipt_no: Optional[str] = None) -> FeeCollection:
    """Money in as advance: its own line on a receipt (caller commits)."""
    if amount <= 0:
        raise _400("The advance must be above zero")
    h = head(db, tenant_id, school_id)
    sf = StudentFee(tenant_id=tenant_id, school_id=school_id, student_id=student_id, fee_head_id=h.id,
                    period="ONETIME", amount_due=amount, amount_paid=amount, due_date=on, status=FeeStatus.paid,
                    paid_at=datetime.now(timezone.utc), payment_mode=mode.value, payment_ref=reference,
                    notes=(note or "Paid in advance")[:300], source="advance", recorded_by_user_id=actor_id)
    db.add(sf)
    db.flush()
    from app.services import ledger_service

    return ledger_service.record_collection(db, sf, amount, mode, reference=reference, on=on, actor_id=actor_id,
                                            notes=note, receipt_no=receipt_no)


def balance(db: Session, student_id: int) -> Decimal:
    h_ids = select(FeeHead.id).where(FeeHead.code == CODE)
    paid_in = db.execute(select(func.coalesce(func.sum(StudentFee.amount_paid), 0)).where(
        StudentFee.student_id == student_id, StudentFee.fee_head_id.in_(h_ids))).scalar_one()
    used = db.execute(select(func.coalesce(func.sum(AdvanceUse.amount), 0)).where(AdvanceUse.student_id == student_id)).scalar_one()
    return Decimal(paid_in) - Decimal(used)


def apply(db: Session, user: User, student_id: int, lines: list[dict]) -> dict:
    """Pay some of the student's fees from their advance."""
    st = db.get(Student, student_id)
    if not st or st.school_id != user.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    have = balance(db, student_id)
    want = sum((Decimal(str(ln["amount"])) for ln in lines), ZERO)
    if want <= 0:
        raise _400("Enter an amount to use")
    if want > have:
        raise _400(f"The advance holds only Rs {have:,.2f}")
    today = date.today()
    used = ZERO
    for ln in sorted(lines, key=lambda x: int(x["fee_id"])):
        amt = Decimal(str(ln["amount"]))
        if amt <= 0:
            continue
        sf = db.get(StudentFee, int(ln["fee_id"]))
        if not sf or sf.student_id != student_id:
            raise _400("That fee isn't this student's")
        db.refresh(sf, with_for_update=True)
        left = sf.amount_due - sf.amount_paid if sf.status == FeeStatus.pending else ZERO
        if amt > left:
            raise _400(f"More than the Rs {left:,.2f} still due on one fee")
        sf.amount_paid += amt
        if sf.amount_paid >= sf.amount_due:
            sf.status = FeeStatus.paid
            sf.paid_at = datetime.now(timezone.utc)
        sf.recorded_by_user_id = user.id
        db.add(AdvanceUse(tenant_id=user.tenant_id, school_id=user.school_id, student_id=student_id,
                          student_fee_id=sf.id, amount=amt, used_on=today, used_by_user_id=user.id))
        used += amt
    db.commit()
    return {"used": used, "balance": balance(db, student_id)}


def statement(db: Session, school_id: int, student_id: int) -> dict:
    """The student's advance: what came in (with its receipt) and what it paid."""
    h_ids = select(FeeHead.id).where(FeeHead.code == CODE, FeeHead.school_id == school_id)
    ins = db.execute(select(StudentFee, FeeCollection.receipt_no, FeeCollection.mode)
                     .join(FeeCollection, FeeCollection.student_fee_id == StudentFee.id, isouter=True)
                     .where(StudentFee.student_id == student_id, StudentFee.fee_head_id.in_(h_ids))).all()
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(FeeHead.school_id == school_id)).all())
    outs = db.execute(select(AdvanceUse, StudentFee).join(StudentFee, StudentFee.id == AdvanceUse.student_fee_id)
                      .where(AdvanceUse.student_id == student_id)).all()
    rows = [{"date": sf.due_date, "kind": "in", "amount": sf.amount_paid, "detail": sf.notes, "receipt_no": rno,
             "mode": mode.value if mode else None} for sf, rno, mode in ins]
    rows += [{"date": u.used_on, "kind": "used", "amount": u.amount,
              "detail": f"{heads.get(f.fee_head_id, '')}{'' if f.period == 'ONETIME' else ' ' + f.period}", "receipt_no": None, "mode": None}
             for u, f in outs]
    rows.sort(key=lambda r: (r["date"], r["kind"] != "in"))
    return {"student_id": student_id, "balance": balance(db, student_id), "rows": rows}


def holders(db: Session, school_id: int) -> dict:
    """Every student holding an advance: the excess payments report."""
    h_ids = select(FeeHead.id).where(FeeHead.code == CODE, FeeHead.school_id == school_id)
    paid = dict(db.execute(select(StudentFee.student_id, func.sum(StudentFee.amount_paid))
                           .where(StudentFee.school_id == school_id, StudentFee.fee_head_id.in_(h_ids))
                           .group_by(StudentFee.student_id)).all())
    used = dict(db.execute(select(AdvanceUse.student_id, func.sum(AdvanceUse.amount))
                           .where(AdvanceUse.school_id == school_id).group_by(AdvanceUse.student_id)).all())
    ids = [sid for sid in paid if Decimal(paid[sid]) - Decimal(used.get(sid, 0)) > 0]
    from app.services.fee_reports_service import _labels

    secs, classes = _labels(db, school_id)
    owing = dict(db.execute(select(StudentFee.student_id, func.sum(StudentFee.amount_due - StudentFee.amount_paid))
                            .where(StudentFee.student_id.in_(ids or [-1]), StudentFee.status == FeeStatus.pending)
                            .group_by(StudentFee.student_id)).all())
    rows = []
    for st in db.execute(select(Student).where(Student.id.in_(ids or [-1])).order_by(Student.full_name)).scalars():
        sec = secs.get(st.section_id)
        rows.append({"student_id": st.id, "student_name": st.full_name, "admission_no": st.admission_no,
                     "class_label": f"{classes.get(sec.class_id, '')} {sec.name}".strip() if sec else None,
                     "paid_in": Decimal(paid[st.id]), "used": Decimal(used.get(st.id, 0)),
                     "balance": Decimal(paid[st.id]) - Decimal(used.get(st.id, 0)),
                     "still_owing": Decimal(owing.get(st.id) or 0), "is_active": st.is_active})
    return {"rows": rows, "total": sum((r["balance"] for r in rows), ZERO)}


# ---------- moving a payment to another student ----------


def move_request(db: Session, user: User, collection_id: int, to_student_id: int, reason: str) -> dict:
    from app.services import receipt_cancel_service

    reason = (reason or "").strip()
    if len(reason) < 3:
        raise _400("Say why the payment is being moved")
    lines = receipt_cancel_service._lines(db, user.school_id, collection_id)
    receipt_cancel_service._check(db, lines)
    to = db.get(Student, to_student_id)
    if not to or to.school_id != user.school_id:
        raise _400("Choose the student to move it to")
    if to.id == lines[0].student_id:
        raise _400("That is the same student")
    if any(c.student_fee_id and db.get(StudentFee, c.student_fee_id).fee_head_id == head(db, user.tenant_id, user.school_id).id for c in lines):
        raise _400("This receipt holds an advance; use the advance on the right student's fees instead")
    if user.role in (UserRole.school_admin, UserRole.principal):
        out = apply_move(db, user.school_id, lines[0].id, to.id, reason, requested_by=user.id, approved_by=user.id)
        db.commit()
        return {"status": "moved", **out}
    frm = db.get(Student, lines[0].student_id)
    total = sum((c.amount for c in lines), ZERO)
    db.add(ApprovalRequest(
        tenant_id=user.tenant_id, school_id=user.school_id, kind=ApprovalKind.payment_move,
        status=ApprovalStatus.pending, requested_by_user_id=user.id, reason=reason,
        payload={"receipt": lines[0].receipt_no, "amount": f"Rs {total:,.2f}",
                 "from": f"{frm.full_name} ({frm.admission_no})", "to": f"{to.full_name} ({to.admission_no})",
                 "receipt_ref": str(lines[0].id), "student_ref": str(to.id)},
    ))
    db.commit()
    return {"status": "requested", "receipt_no": lines[0].receipt_no}


def apply_move(db: Session, school_id: int, collection_id: int, to_student_id: int, reason: str, *,
               requested_by: Optional[int], approved_by: Optional[int]) -> dict:
    """Cancel the receipt on the first child and record the money on the
    second (caller commits)."""
    from app.services import ledger_service, receipt_cancel_service

    first = db.get(FeeCollection, collection_id)
    to = db.get(Student, to_student_id)
    on, mode, ref, actor = first.collected_on, first.mode, first.reference, first.collected_by_user_id
    old_no = first.receipt_no
    archived = receipt_cancel_service.apply(db, school_id, collection_id, f"Moved to {to.full_name} ({to.admission_no}): {reason}",
                                            requested_by=requested_by, approved_by=approved_by)
    money = archived.amount
    receipt_no = ledger_service.next_receipt(db, school_id, on)
    note = f"Moved from receipt {old_no}"
    fees = db.execute(select(StudentFee).where(
        StudentFee.student_id == to.id, StudentFee.status == FeeStatus.pending, StudentFee.amount_paid < StudentFee.amount_due,
    ).order_by(StudentFee.due_date, StudentFee.id)).scalars().all()
    applied = ZERO
    for sf in fees:
        if money <= 0:
            break
        db.refresh(sf, with_for_update=True)
        amt = min(money, sf.amount_due - sf.amount_paid)
        sf.amount_paid += amt
        if sf.amount_paid >= sf.amount_due:
            sf.status = FeeStatus.paid
            sf.paid_at = datetime.now(timezone.utc)
        ledger_service.record_collection(db, sf, amt, mode, reference=ref, on=on, actor_id=actor, notes=note, receipt_no=receipt_no)
        money -= amt
        applied += amt
    if money > 0:
        add_advance(db, tenant_id=to.tenant_id, school_id=school_id, student_id=to.id, amount=money, mode=mode, on=on,
                    reference=ref, actor_id=actor, note=note, receipt_no=receipt_no)
    return {"receipt_no": receipt_no, "applied": applied, "as_advance": money}


def apply_approval(db: Session, a: ApprovalRequest) -> None:
    p = a.payload or {}
    apply_move(db, a.school_id, int(p.get("receipt_ref") or 0), int(p.get("student_ref") or 0), a.reason or "approved",
               requested_by=a.requested_by_user_id, approved_by=a.reviewed_by_user_id)
