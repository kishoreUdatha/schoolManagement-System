"""Late-fee (fine) rules and fee refunds.

Late fees: rules say what to charge on overdue fees. Running them raises a
separate student fee line per overdue fee (source 'late_fee'), so the charge is
visible to the parent, collectable like any fee and reported under its own head.
Re-running updates the amount instead of adding a second charge.

Refunds: requested by the accountant/admin, approved by the admin or principal,
then paid out. Processing reduces what the original fee counts as paid and
shows as an outflow in the cash book."""
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import NotificationCategory
from app.core.enums import FeeStatus, LateFeeBasis, MoneyMode, RefundStatus, UserRole
from app.core.scoping import school_today, section_labels
from app.models.accounts import FeeCollection
from app.models.fee import FeeHead, StudentFee
from app.models.fee_extra import LateFeeRule, Refund
from app.models.student import Student
from app.models.user import User
from app.schemas.fee_extra import LateFeeRuleIn, RefundDecideIn, RefundIn, RefundProcessIn

ZERO = Decimal("0.00")
LATE_FEE_SOURCE = "late_fee"


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _money(v: Decimal) -> Decimal:
    return Decimal(v).quantize(Decimal("0.01"), ROUND_HALF_UP)


# ---------- late fee rules ----------


def list_rules(db: Session, school_id: int) -> list[LateFeeRule]:
    return list(db.execute(
        select(LateFeeRule).where(LateFeeRule.school_id == school_id).order_by(LateFeeRule.name)
    ).scalars())


def _check_heads(db: Session, school_id: int, data: LateFeeRuleIn) -> None:
    charge = db.get(FeeHead, data.charge_head_id)
    if not charge or charge.school_id != school_id:
        raise _400("Pick the fee head the late fee is booked under")
    if data.fee_head_id is not None:
        h = db.get(FeeHead, data.fee_head_id)
        if not h or h.school_id != school_id:
            raise _400("Unknown fee head")
        if h.id == charge.id:
            raise _400("The late-fee head must differ from the head it applies to")


def create_rule(db: Session, user: User, data: LateFeeRuleIn) -> LateFeeRule:
    _check_heads(db, user.school_id, data)
    r = LateFeeRule(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def update_rule(db: Session, user: User, rule_id: int, data: LateFeeRuleIn) -> LateFeeRule:
    r = db.get(LateFeeRule, rule_id)
    if not r or r.school_id != user.school_id:
        raise _404("Rule")
    _check_heads(db, user.school_id, data)
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


def delete_rule(db: Session, user: User, rule_id: int) -> None:
    r = db.get(LateFeeRule, rule_id)
    if not r or r.school_id != user.school_id:
        raise _404("Rule")
    db.delete(r)
    db.commit()


def rule_to_read(db: Session, r: LateFeeRule) -> dict:
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(FeeHead.id.in_({r.fee_head_id, r.charge_head_id} - {None}))).all())
    return dict(id=r.id, name=r.name, fee_head_id=r.fee_head_id, fee_head_name=heads.get(r.fee_head_id),
                charge_head_id=r.charge_head_id, charge_head_name=heads.get(r.charge_head_id, ""),
                basis=r.basis, amount=r.amount, grace_days=r.grace_days, max_amount=r.max_amount, is_active=r.is_active)


# ---------- applying late fees ----------


def _charge_for(rule: LateFeeRule, fee: StudentFee, on: date) -> Decimal:
    days_late = (on - fee.due_date).days - rule.grace_days
    if days_late <= 0:
        return ZERO
    outstanding = fee.amount_due - fee.amount_paid
    if rule.basis == LateFeeBasis.per_day:
        amount = rule.amount * days_late
    elif rule.basis == LateFeeBasis.once:
        amount = rule.amount
    else:  # percent of what's still owed, per started month
        months = (days_late + 29) // 30
        amount = outstanding * rule.amount / 100 * months
    if rule.max_amount is not None:
        amount = min(amount, rule.max_amount)
    return _money(amount)


def preview_late_fees(db: Session, school_id: int, on: Optional[date] = None) -> dict:
    """What running the rules today would charge, per student fee."""
    on = on or school_today(db, school_id)
    rules = [r for r in list_rules(db, school_id) if r.is_active]
    if not rules:
        return dict(date=on, rules=0, rows=[], total=ZERO)
    overdue = list(db.execute(
        select(StudentFee).where(
            StudentFee.school_id == school_id,
            StudentFee.status == FeeStatus.pending,
            StudentFee.due_date < on,
            (StudentFee.source.is_(None)) | (StudentFee.source != LATE_FEE_SOURCE),
        )
    ).scalars())
    existing = {
        (f.source_id, f.period): f for f in db.execute(
            select(StudentFee).where(StudentFee.school_id == school_id, StudentFee.source == LATE_FEE_SOURCE)
        ).scalars()
    }
    students = dict(db.execute(
        select(Student.id, Student.full_name).where(Student.id.in_({f.student_id for f in overdue} or {-1}))
    ).all())
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(FeeHead.school_id == school_id)).all())
    rows, total = [], ZERO
    for fee in overdue:
        rule = next((r for r in rules if r.fee_head_id in (None, fee.fee_head_id)), None)
        if not rule:
            continue
        amount = _charge_for(rule, fee, on)
        if amount <= 0:
            continue
        old = existing.get((fee.id, fee.period))
        already = old.amount_due if old else ZERO
        if old and old.status != FeeStatus.pending:
            continue  # already paid or waived: leave it alone
        rows.append(dict(
            student_fee_id=fee.id, student_id=fee.student_id, student_name=students.get(fee.student_id, ""),
            period=fee.period, head_name=heads.get(fee.fee_head_id, ""), due_date=fee.due_date,
            days_late=(on - fee.due_date).days, outstanding=fee.amount_due - fee.amount_paid,
            rule_name=rule.name, charge=amount, already_charged=already, delta=_money(amount - already),
        ))
        total += _money(amount - already)
    rows.sort(key=lambda r: (-r["days_late"], r["student_name"]))
    return dict(date=on, rules=len(rules), rows=rows, total=total)


def apply_late_fees(db: Session, user: User, on: Optional[date] = None, notify_parents: bool = False) -> dict:
    """Raise/refresh the late-fee lines. Safe to run daily."""
    on = on or school_today(db, user.school_id)
    plan = preview_late_fees(db, user.school_id, on)
    rules = {r.name: r for r in list_rules(db, user.school_id)}
    created = updated = 0
    for row in plan["rows"]:
        fee = db.get(StudentFee, row["student_fee_id"])
        rule = rules[row["rule_name"]]
        existing = db.execute(
            select(StudentFee).where(
                StudentFee.student_id == fee.student_id, StudentFee.source == LATE_FEE_SOURCE,
                StudentFee.source_id == fee.id, StudentFee.period == fee.period,
            )
        ).scalar_one_or_none()
        if existing:
            if existing.status != FeeStatus.pending or existing.amount_due == row["charge"]:
                continue
            existing.amount_due = row["charge"]
            updated += 1
        else:
            db.add(StudentFee(
                tenant_id=fee.tenant_id, school_id=fee.school_id, student_id=fee.student_id,
                fee_head_id=rule.charge_head_id, source=LATE_FEE_SOURCE, source_id=fee.id, period=fee.period,
                amount_due=row["charge"], due_date=on, status=FeeStatus.pending,
                notes=f"Late fee ({rule.name}) — {row['days_late']} days after {fee.due_date}",
            ))
            created += 1
            if notify_parents:
                st = db.get(Student, fee.student_id)
                if st:
                    notify.student_parents(
                        db, st, "Late fee added",
                        f"A late fee of {row['charge']} was added because the {row['head_name']} fee for "
                        f"{row['period']} was due on {fee.due_date}.",
                        category=NotificationCategory.fees, link="/parent/fees",
                    )
    db.commit()
    return dict(date=on, created=created, updated=updated, total=plan["total"])


# ---------- refunds ----------


def _get(db: Session, refund_id: int, school_id: int) -> Refund:
    r = db.get(Refund, refund_id)
    if not r or r.school_id != school_id:
        raise _404("Refund")
    return r


def refundable(db: Session, fee: StudentFee) -> Decimal:
    """What can still be refunded: the amount paid, less refunds already in
    flight. Processing a refund lowers amount_paid, so processed ones are
    already accounted for."""
    reserved = db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.student_fee_id == fee.id,
            Refund.status.in_([RefundStatus.requested, RefundStatus.approved]),
        )
    ).scalar_one()
    return _money(max(fee.amount_paid - Decimal(reserved), ZERO))


def request_refund(db: Session, user: User, data: RefundIn) -> Refund:
    st = db.get(Student, data.student_id)
    if not st or st.school_id != user.school_id:
        raise _400("Unknown student")
    fee = None
    if data.student_fee_id is not None:
        fee = db.get(StudentFee, data.student_fee_id)
        if not fee or fee.student_id != st.id:
            raise _400("That fee doesn't belong to this student")
        left = refundable(db, fee)
        if data.amount > left:
            raise _400(f"Only {left} can be refunded against this fee")
    else:
        # Not tied to one fee: never more than the family has paid in all,
        # less refunds already asked for, agreed or paid out.
        collected = db.execute(
            select(func.coalesce(func.sum(FeeCollection.amount), 0)).where(FeeCollection.student_id == st.id)
        ).scalar_one()
        promised = db.execute(
            select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.student_id == st.id, Refund.status != RefundStatus.rejected
            )
        ).scalar_one()
        left = Decimal(collected) - Decimal(promised)
        if data.amount > left:
            raise _400(f"Only {max(left, Decimal('0'))} of this student's payments can still be refunded")
    r = Refund(tenant_id=user.tenant_id, school_id=user.school_id, student_id=st.id,
               student_fee_id=fee.id if fee else None, amount=data.amount, reason=data.reason,
               mode=data.mode, requested_by_user_id=user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def decide_refund(db: Session, user: User, refund_id: int, data: RefundDecideIn) -> Refund:
    r = _get(db, refund_id, user.school_id)
    from app.services import rbac_service

    if user.role not in (UserRole.school_admin, UserRole.principal) and not rbac_service.has_permission(db, user, "fees.refund.approve"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the school admin, principal or someone with the refund permission can approve refunds")
    if r.status != RefundStatus.requested:
        raise _400("This refund has already been decided")
    if not data.approve and not (data.note or "").strip():
        raise _400("Give a reason when rejecting a refund")
    r.status = RefundStatus.approved if data.approve else RefundStatus.rejected
    r.decided_by_user_id, r.decided_at, r.decision_note = user.id, datetime.now(timezone.utc), data.note
    db.commit()
    db.refresh(r)
    return r


def process_refund(db: Session, user: User, refund_id: int, data: RefundProcessIn) -> Refund:
    r = _get(db, refund_id, user.school_id)
    db.refresh(r, with_for_update=True)  # one payout per refund, even on a double submit
    if r.status != RefundStatus.approved:
        raise _400("Only approved refunds can be paid out")
    if data.processed_on > school_today(db, user.school_id):
        raise _400("Can't record a refund in the future")
    if r.student_fee_id:
        fee = db.get(StudentFee, r.student_fee_id)
        db.refresh(fee, with_for_update=True)
        left = refundable(db, fee)
        if r.amount > left:
            raise _400(f"Only {left} can still be refunded against this fee")
        fee.amount_paid = _money(fee.amount_paid - r.amount)
        if fee.status == FeeStatus.paid and fee.amount_paid < fee.amount_due:
            fee.status, fee.paid_at = FeeStatus.pending, None
    r.status = RefundStatus.processed
    r.processed_on, r.processed_by_user_id, r.reference = data.processed_on, user.id, data.reference
    st = db.get(Student, r.student_id)
    if st:
        notify.student_parents(db, st, "Fee refund processed",
                               f"A refund of {r.amount} was processed on {data.processed_on:%d %b %Y}. {r.reason}",
                               category=NotificationCategory.fees, link="/parent/payments-receipts")
    db.commit()
    db.refresh(r)
    return r


def list_refunds(db: Session, school_id: int, status_: Optional[RefundStatus], student_id: Optional[int],
                 frm: Optional[date], to: Optional[date]) -> list[Refund]:
    stmt = select(Refund).where(Refund.school_id == school_id)
    if status_:
        stmt = stmt.where(Refund.status == status_)
    if student_id:
        stmt = stmt.where(Refund.student_id == student_id)
    if frm:
        stmt = stmt.where(func.coalesce(Refund.processed_on, func.date(Refund.created_at)) >= frm)
    if to:
        stmt = stmt.where(func.coalesce(Refund.processed_on, func.date(Refund.created_at)) <= to)
    return list(db.execute(stmt.order_by(Refund.id.desc()).limit(500)).scalars())


def refunds_to_read(db: Session, refunds: list[Refund]) -> list[dict]:
    if not refunds:
        return []
    students = {
        s.id: s for s in db.execute(select(Student).where(Student.id.in_({r.student_id for r in refunds}))).scalars()
    }
    labels = section_labels(db, {s.section_id for s in students.values()})
    users = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_(
            {r.requested_by_user_id for r in refunds} | {r.decided_by_user_id for r in refunds} | {r.processed_by_user_id for r in refunds} - {None}
        ))
    ).all())
    fees = {
        f.id: f for f in db.execute(
            select(StudentFee).where(StudentFee.id.in_({r.student_fee_id for r in refunds if r.student_fee_id} or {-1}))
        ).scalars()
    }
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(
        FeeHead.id.in_({f.fee_head_id for f in fees.values()} or {-1})
    )).all())
    out = []
    for r in refunds:
        st = students.get(r.student_id)
        fee = fees.get(r.student_fee_id) if r.student_fee_id else None
        out.append(dict(
            id=r.id, student_id=r.student_id, student_name=st.full_name if st else "",
            section_label=labels.get(st.section_id) if st else None, student_fee_id=r.student_fee_id,
            fee_label=f"{heads.get(fee.fee_head_id, '')} {fee.period}" if fee else None,
            amount=r.amount, reason=r.reason, mode=r.mode, status=r.status,
            requested_by_name=users.get(r.requested_by_user_id), created_at=r.created_at,
            decided_by_name=users.get(r.decided_by_user_id), decided_at=r.decided_at, decision_note=r.decision_note,
            processed_on=r.processed_on, processed_by_name=users.get(r.processed_by_user_id), reference=r.reference,
        ))
    return out


def processed_total(db: Session, school_id: int, frm: date, to: date) -> Decimal:
    return Decimal(db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.school_id == school_id, Refund.status == RefundStatus.processed,
            Refund.processed_on.between(frm, to),
        )
    ).scalar_one())


def processed_rows(db: Session, school_id: int, frm: date, to: date) -> list[Refund]:
    return list(db.execute(
        select(Refund).where(
            Refund.school_id == school_id, Refund.status == RefundStatus.processed,
            Refund.processed_on.between(frm, to),
        )
    ).scalars())


def student_refund_options(db: Session, school_id: int, student_id: int) -> list[dict]:
    """Paid (or part-paid) fees a refund can be raised against."""
    fees = list(db.execute(
        select(StudentFee).where(StudentFee.student_id == student_id, StudentFee.school_id == school_id,
                                 StudentFee.amount_paid > 0).order_by(StudentFee.due_date.desc())
    ).scalars())
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(FeeHead.school_id == school_id)).all())
    receipts = dict(db.execute(
        select(FeeCollection.student_fee_id, func.max(FeeCollection.receipt_no))
        .where(FeeCollection.student_fee_id.in_([f.id for f in fees] or [-1]))
        .group_by(FeeCollection.student_fee_id)
    ).all())
    return [
        dict(student_fee_id=f.id, label=f"{heads.get(f.fee_head_id, '')} {f.period}", paid=f.amount_paid,
             refundable=refundable(db, f), receipt_no=receipts.get(f.id))
        for f in fees if refundable(db, f) > 0
    ]
