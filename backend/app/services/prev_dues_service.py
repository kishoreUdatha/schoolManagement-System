"""Dues from earlier years.

Two kinds, both collected like any other fee:

* entered: what students owed when the school started on this system (or
  owed under the old register), entered against the built-in fee type
  "Previous year dues" (code PREV_DUES). In the books these are an opening
  balance (Fees receivable Dr, Capital fund Cr), not this year's income:
  the income was the earlier year's.
* carried over: fees of an earlier academic year still unpaid. They stay due
  as they were; this report and Collect fees show them as previous year.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.enums import FeeStatus
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.fee import FeeHead, StudentFee
from app.models.student import Student
from app.models.user import User

CODE = "PREV_DUES"
ZERO = Decimal("0")


def head(db: Session, user: User) -> FeeHead:
    """The school's "Previous year dues" fee type, made the first time it is needed."""
    h = db.execute(select(FeeHead).where(FeeHead.school_id == user.school_id, FeeHead.code == CODE)).scalars().first()
    if h is None:
        h = FeeHead(tenant_id=user.tenant_id, school_id=user.school_id, name="Previous year dues", code=CODE,
                    is_recurring=False, is_active=True)
        db.add(h)
        db.flush()
    return h


def year_start(db: Session, school_id: int) -> date:
    y = db.execute(select(AcademicYear).where(AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True))).scalars().first()
    if y is not None:
        return y.start_date
    today = date.today()
    return date(today.year if today.month >= 4 else today.year - 1, 4, 1)


def _student(db: Session, school_id: int, key: str) -> Optional[Student]:
    key = (key or "").strip()
    if not key:
        return None
    return db.execute(select(Student).where(Student.school_id == school_id, Student.admission_no.ilike(key))).scalars().first()


def add(db: Session, user: User, rows: list[dict]) -> dict:
    """Enter previous-year dues, one row per student: admission no., amount,
    the year they are from, a note. A student who already has unpaid dues
    from that year has the amount replaced; nothing is added twice."""
    h = head(db, user)
    start = year_start(db, user.school_id)
    added = updated = 0
    errors = []
    for i, r in enumerate(rows, 1):
        st = _student(db, user.school_id, str(r.get("admission_no") or ""))
        if st is None:
            errors.append({"row": i, "error": f"No student with admission no. {r.get('admission_no') or '(blank)'}"})
            continue
        try:
            amount = Decimal(str(r.get("amount") or "").replace(",", "").strip())
        except InvalidOperation:
            errors.append({"row": i, "error": f"{st.admission_no}: the amount isn't a number"})
            continue
        if amount <= 0:
            errors.append({"row": i, "error": f"{st.admission_no}: the amount must be above zero"})
            continue
        year = (r.get("year") or "").strip()[:12] or f"{start.year - 1}-{str(start.year)[2:]}"
        note = (r.get("note") or "").strip()
        label = f"Dues from {year}" + (f": {note}" if note else "")
        existing = db.execute(select(StudentFee).where(
            StudentFee.student_id == st.id, StudentFee.fee_head_id == h.id, StudentFee.notes.like(f"Dues from {year}%")
        )).scalars().first()
        if existing is not None:
            if existing.amount_paid > 0 or existing.status != FeeStatus.pending:
                errors.append({"row": i, "error": f"{st.admission_no}: dues from {year} have payments already; change them on Waive & adjust"})
                continue
            existing.amount_due, existing.notes = amount, label[:300]
            updated += 1
            continue
        db.add(StudentFee(tenant_id=user.tenant_id, school_id=user.school_id, student_id=st.id, fee_head_id=h.id,
                          period="ONETIME", amount_due=amount, amount_paid=ZERO, due_date=start,
                          status=FeeStatus.pending, notes=label[:300], source="previous_year",
                          recorded_by_user_id=user.id))
        added += 1
    db.commit()
    return {"added": added, "updated": updated, "errors": errors}


def report(db: Session, school_id: int) -> dict:
    """Every unpaid due from before this academic year: entered or carried over."""
    start = year_start(db, school_id)
    h = db.execute(select(FeeHead.id).where(FeeHead.school_id == school_id, FeeHead.code == CODE)).scalar_one_or_none()
    rows = db.execute(
        select(StudentFee, FeeHead.name, Student)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id)
        .join(Student, Student.id == StudentFee.student_id)
        .where(StudentFee.school_id == school_id, StudentFee.status == FeeStatus.pending,
               StudentFee.amount_paid < StudentFee.amount_due,
               or_(StudentFee.fee_head_id == (h or -1), StudentFee.due_date < start))
        .order_by(Student.full_name, StudentFee.due_date)
    ).all()
    secs = {s.id: s for s in db.execute(select(Section).where(Section.id.in_({st.section_id for _, _, st in rows if st.section_id} or {-1}))).scalars()}
    classes = dict(db.execute(select(SchoolClass.id, SchoolClass.name).where(SchoolClass.school_id == school_id)).all())
    out = []
    for sf, hname, st in rows:
        sec = secs.get(st.section_id)
        out.append({
            "fee_id": sf.id, "student_id": st.id, "student_name": st.full_name, "admission_no": st.admission_no,
            "class_label": f"{classes.get(sec.class_id, '')} {sec.name}".strip() if sec else None,
            "fee_head_name": hname, "period": sf.period, "note": sf.notes, "due_date": sf.due_date,
            "kind": "entered" if sf.fee_head_id == h else "carried over",
            "amount_due": sf.amount_due, "amount_paid": sf.amount_paid, "outstanding": sf.amount_due - sf.amount_paid,
            "is_active": st.is_active,
        })
    return {
        "year_start": start,
        "rows": out,
        "students": len({r["student_id"] for r in out}),
        "total": sum((r["outstanding"] for r in out), ZERO),
        "entered": sum((r["outstanding"] for r in out if r["kind"] == "entered"), ZERO),
        "carried": sum((r["outstanding"] for r in out if r["kind"] != "entered"), ZERO),
    }


def remove(db: Session, user: User, fee_id: int) -> None:
    """Take back an entered due typed in error, while nothing is paid on it."""
    sf = db.get(StudentFee, fee_id)
    h = db.execute(select(FeeHead.id).where(FeeHead.school_id == user.school_id, FeeHead.code == CODE)).scalar_one_or_none()
    if not sf or sf.school_id != user.school_id or sf.fee_head_id != h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entered due not found")
    if sf.amount_paid > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Something is paid on it already; adjust or waive it instead")
    db.delete(sf)
    db.commit()
