from calendar import monthrange
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import FeeStatus
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.student import Student
from app.schemas.fee import (
    ChargeCorrection,
    FeeHeadCreate,
    FeeHeadUpdate,
    FeeStructureCreate,
    FeeStructureUpdate,
    GenerateMonthlyRequest,
    RecordPayment,
)
from app.services import ledger_service


# ----- Fee heads -----

def _get_head(db: Session, head_id: int, school_id: int) -> FeeHead:
    h = db.get(FeeHead, head_id)
    if not h or h.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fee head not found"
        )
    return h


def create_head(
    db: Session, tenant_id: int, school_id: int, data: FeeHeadCreate
) -> FeeHead:
    h = FeeHead(
        tenant_id=tenant_id,
        school_id=school_id,
        name=data.name.strip(),
        code=data.code.strip().upper(),
        is_recurring=data.is_recurring,
        late_fee_type=data.late_fee_type,
        late_fee_value=data.late_fee_value,
        late_fee_after_days=data.late_fee_after_days,
        is_active=True,
    )
    db.add(h)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Fee head code '{data.code}' already exists for this school",
        )
    db.refresh(h)
    return h


def list_heads(
    db: Session, school_id: int, *, active_only: bool = False
) -> list[FeeHead]:
    stmt = (
        select(FeeHead)
        .where(FeeHead.school_id == school_id)
        .order_by(FeeHead.is_recurring.desc(), FeeHead.name)
    )
    if active_only:
        stmt = stmt.where(FeeHead.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def update_head(
    db: Session, head_id: int, school_id: int, data: FeeHeadUpdate
) -> FeeHead:
    h = _get_head(db, head_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()
    if "code" in updates and updates["code"]:
        updates["code"] = updates["code"].strip().upper()
    for field, value in updates.items():
        setattr(h, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another fee head with this code already exists",
        )
    db.refresh(h)
    return h


def delete_head(db: Session, head_id: int, school_id: int) -> None:
    h = _get_head(db, head_id, school_id)
    in_use = db.execute(
        select(func.count(FeeStructure.id)).where(FeeStructure.fee_head_id == h.id)
    ).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Fee head '{h.name}' is used in {in_use} fee structure(s). "
                "Remove those first or deactivate the head instead."
            ),
        )
    raised = db.execute(
        select(func.count(StudentFee.id)).where(StudentFee.fee_head_id == h.id)
    ).scalar_one()
    if raised:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Fee head '{h.name}' has {raised} fee(s) raised against it. "
                "Deactivate the head instead, so its history stays."
            ),
        )
    db.delete(h)
    try:
        db.commit()
    except IntegrityError:
        # Something else still points at it (a fine rule, concession, assignment…).
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fee head '{h.name}' is still in use. Deactivate it instead.",
        )


# ----- Fee structures -----

def _get_structure(
    db: Session, structure_id: int, school_id: int
) -> FeeStructure:
    s = db.get(FeeStructure, structure_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fee structure not found"
        )
    return s


def create_structure(
    db: Session, tenant_id: int, school_id: int, data: FeeStructureCreate
) -> FeeStructure:
    # Validate the head, year, and class belong to this school
    head = _get_head(db, data.fee_head_id, school_id)
    if not head.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fee head is inactive",
        )
    year = db.get(AcademicYear, data.academic_year_id)
    if not year or year.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found"
        )
    cls = db.get(SchoolClass, data.class_id)
    if not cls or cls.school_id != school_id or cls.academic_year_id != year.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Class does not belong to this academic year",
        )

    s = FeeStructure(
        tenant_id=tenant_id,
        school_id=school_id,
        academic_year_id=year.id,
        class_id=cls.id,
        fee_head_id=head.id,
        amount=data.amount,
        due_day_of_month=data.due_day_of_month,
    )
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A fee structure for {head.name} in this class+year already exists. "
                "Edit the existing one instead."
            ),
        )
    db.refresh(s)
    return s


def list_structures(
    db: Session,
    school_id: int,
    *,
    academic_year_id: Optional[int] = None,
    class_id: Optional[int] = None,
) -> list[tuple[FeeStructure, FeeHead]]:
    stmt = (
        select(FeeStructure, FeeHead)
        .join(FeeHead, FeeStructure.fee_head_id == FeeHead.id)
        .where(FeeStructure.school_id == school_id)
        .order_by(FeeHead.is_recurring.desc(), FeeHead.name)
    )
    if academic_year_id:
        stmt = stmt.where(FeeStructure.academic_year_id == academic_year_id)
    if class_id:
        stmt = stmt.where(FeeStructure.class_id == class_id)
    return list(db.execute(stmt).all())


def update_structure(
    db: Session, structure_id: int, school_id: int, data: FeeStructureUpdate
) -> tuple[FeeStructure, FeeHead]:
    s = _get_structure(db, structure_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    head = db.get(FeeHead, s.fee_head_id)
    return s, head


def delete_structure(db: Session, structure_id: int, school_id: int) -> None:
    s = _get_structure(db, structure_id, school_id)
    in_use = db.execute(
        select(func.count(StudentFee.id)).where(StudentFee.fee_structure_id == s.id)
    ).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"This structure has {in_use} generated fee record(s). "
                "Delete those first or stop using this structure for the next month."
            ),
        )
    db.delete(s)
    db.commit()


def _base_amount(
    db: Session, student: Student, head: FeeHead, class_amount: Decimal,
    academic_year_id: Optional[int], on: date,
) -> tuple[Decimal, Optional[str]]:
    """What this child is charged before any concession comes off.

    The class structure, unless an assignment names a different number for
    this child. Concessions are applied by the caller on top, because the two
    answer different questions: an assignment says what the charge is, a
    concession says what comes off it.
    """
    from app.services import finance_service

    if not academic_year_id:
        return class_amount, None
    a = finance_service.active_assignment(db, student.id, head.id, academic_year_id, on)
    if a is None:
        return class_amount, None
    if a.period and a.period != _period_of(on):
        return class_amount, None
    return a.amount, f"Own rate ({a.reason}): {a.amount:,.2f} in place of {class_amount:,.2f}."


def _period_of(on: date) -> str:
    return f"{on:%Y-%m}"

# ----- Generation -----

def _compute_due_date(period: str, due_day: int) -> date:
    year, month = (int(x) for x in period.split("-"))
    max_day = monthrange(year, month)[1]
    return date(year, month, min(due_day, max_day))


def generate_monthly(
    db: Session, tenant_id: int, school_id: int, data: GenerateMonthlyRequest
) -> dict:
    """Create student_fees rows for every active student in every class that has
    a recurring fee_structure for this academic year, for the given period.

    Idempotent: existing (student, structure, period) rows are skipped.
    """
    structures = db.execute(
        select(FeeStructure, FeeHead)
        .join(FeeHead, FeeStructure.fee_head_id == FeeHead.id)
        .where(
            FeeStructure.school_id == school_id,
            FeeStructure.academic_year_id == data.academic_year_id,
            FeeHead.is_recurring.is_(True),
            FeeHead.is_active.is_(True),
        )
    ).all()

    created = 0
    skipped = 0
    for structure, head in structures:
        due_date = _compute_due_date(data.period, structure.due_day_of_month)
        students = db.execute(
            select(Student)
            .join(Section, Student.section_id == Section.id)
            .where(
                Student.school_id == school_id,
                Student.is_active.is_(True),
                Student.academic_year_id == data.academic_year_id,
                Section.class_id == structure.class_id,
            )
        ).scalars().all()

        for student in students:
            base, base_note = _base_amount(
                db, student, head, structure.amount, data.academic_year_id, due_date
            )
            amount, note = ledger_service.discounted(db, student.id, head.id, base, due_date)
            note = " ".join(x for x in (base_note, note) if x) or None
            try:
                with db.begin_nested():
                    db.add(
                        StudentFee(
                            tenant_id=tenant_id,
                            school_id=school_id,
                            student_id=student.id,
                            fee_structure_id=structure.id,
                            fee_head_id=head.id,
                            period=data.period,
                            amount_due=amount,
                            amount_paid=Decimal("0"),
                            due_date=due_date,
                            # A 100% concession leaves nothing to collect.
                            status=FeeStatus.pending if amount > 0 else FeeStatus.waived,
                            notes=note,
                        )
                    )
                    db.flush()
                created += 1
            except IntegrityError:
                skipped += 1

    extra, extra_skipped = _generate_extras(
        db, tenant_id, school_id, data.academic_year_id, data.period
    )
    db.commit()
    return {
        "created": created + extra,
        "skipped": skipped + extra_skipped,
        "period": data.period,
        "extras": extra,
    }


def _generate_extras(
    db: Session, tenant_id: int, school_id: int, academic_year_id: int, period: str
) -> tuple[int, int]:
    """Charge the heads a child has been assigned that their class does not have.

    The loop above walks fee structures, so a head with no structure for this
    class is never reached by it — which is exactly the case an assignment
    exists to cover (a child taking music their year group does not take).

    These rows carry source='assignment' rather than a structure id, which is
    what StudentFee's partial unique index on (student, source, source_id,
    period) already keys on, so running this twice is safe without a new
    constraint.
    """
    from app.services import finance_service
    from app.models.fee_plan import StudentFeeAssignment

    rows = db.execute(
        select(StudentFeeAssignment, FeeHead, Student)
        .join(FeeHead, FeeHead.id == StudentFeeAssignment.fee_head_id)
        .join(Student, Student.id == StudentFeeAssignment.student_id)
        .where(
            StudentFeeAssignment.school_id == school_id,
            StudentFeeAssignment.academic_year_id == academic_year_id,
            StudentFeeAssignment.is_active.is_(True),
            Student.is_active.is_(True),
            FeeHead.is_active.is_(True),
        )
    ).all()

    created = skipped = 0
    for a, head, student in rows:
        if a.period and a.period != period:
            continue
        due_date = _compute_due_date(period, a.due_day_of_month)
        if a.starts_on > due_date or (a.ends_on and a.ends_on < due_date):
            continue

        section = db.get(Section, student.section_id) if student.section_id else None
        if section:
            has_structure = db.execute(
                select(FeeStructure.id).where(
                    FeeStructure.class_id == section.class_id,
                    FeeStructure.fee_head_id == head.id,
                    FeeStructure.academic_year_id == academic_year_id,
                )
            ).scalars().first()
            if has_structure:
                continue  # the structure loop already charged this child

        amount, note = ledger_service.discounted(db, student.id, head.id, a.amount, due_date)
        detail = f"Own rate ({a.reason}): {a.amount:,.2f}."
        try:
            with db.begin_nested():
                db.add(
                    StudentFee(
                        tenant_id=tenant_id,
                        school_id=school_id,
                        student_id=student.id,
                        fee_structure_id=None,
                        source="assignment",
                        source_id=a.id,
                        fee_head_id=head.id,
                        period=period,
                        amount_due=amount,
                        amount_paid=Decimal("0"),
                        due_date=due_date,
                        status=FeeStatus.pending if amount > 0 else FeeStatus.waived,
                        notes=" ".join(x for x in (detail, note) if x) or None,
                    )
                )
                db.flush()
            created += 1
        except IntegrityError:
            skipped += 1
    return created, skipped


def generate_one_time_for_student(
    db: Session, tenant_id: int, school_id: int, student: Student
) -> int:
    """Hook: when a student is admitted, create one-time fee records for all
    matching fee_structures (where the head is_recurring=False).

    Idempotent: existing rows are skipped.
    Returns count created.
    """
    cls = (
        db.execute(
            select(Section).where(Section.id == student.section_id)
        ).scalar_one_or_none()
    )
    if not cls:
        return 0

    structures = db.execute(
        select(FeeStructure, FeeHead)
        .join(FeeHead, FeeStructure.fee_head_id == FeeHead.id)
        .where(
            FeeStructure.school_id == school_id,
            FeeStructure.academic_year_id == student.academic_year_id,
            FeeStructure.class_id == cls.class_id,
            FeeHead.is_recurring.is_(False),
            FeeHead.is_active.is_(True),
        )
    ).all()

    today = date.today()
    created = 0
    for structure, head in structures:
        due_date = date(
            today.year, today.month,
            min(structure.due_day_of_month, monthrange(today.year, today.month)[1]),
        )
        base, base_note = _base_amount(
            db, student, head, structure.amount, student.academic_year_id, today
        )
        amount, note = ledger_service.discounted(db, student.id, head.id, base, today)
        note = " ".join(x for x in (base_note, note) if x) or None
        try:
            with db.begin_nested():
                db.add(
                    StudentFee(
                        tenant_id=tenant_id,
                        school_id=school_id,
                        student_id=student.id,
                        fee_structure_id=structure.id,
                        fee_head_id=head.id,
                        period="ONETIME",
                        amount_due=amount,
                        amount_paid=Decimal("0"),
                        due_date=due_date,
                        status=FeeStatus.pending if amount > 0 else FeeStatus.waived,
                        notes=note,
                    )
                )
                db.flush()
            created += 1
        except IntegrityError:
            continue
    db.commit()
    return created


# ----- Student fees -----

def list_student_fees(
    db: Session,
    school_id: int,
    *,
    student_id: Optional[int] = None,
    class_id: Optional[int] = None,
    section_id: Optional[int] = None,
    period: Optional[str] = None,
    status_filter: Optional[str] = None,  # 'pending','paid','overdue','waived','outstanding'
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    stmt = (
        select(StudentFee, Student, FeeHead, Section, SchoolClass)
        .join(Student, StudentFee.student_id == Student.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .join(Section, Student.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(StudentFee.school_id == school_id)
    )

    if student_id:
        stmt = stmt.where(StudentFee.student_id == student_id)
    if section_id:
        stmt = stmt.where(Student.section_id == section_id)
    elif class_id:
        stmt = stmt.where(Section.class_id == class_id)
    if period:
        stmt = stmt.where(StudentFee.period == period)

    today = date.today()
    if status_filter == "paid":
        stmt = stmt.where(StudentFee.status == FeeStatus.paid)
    elif status_filter == "waived":
        stmt = stmt.where(StudentFee.status == FeeStatus.waived)
    elif status_filter == "pending":
        stmt = stmt.where(
            StudentFee.status == FeeStatus.pending,
            StudentFee.due_date >= today,
        )
    elif status_filter == "overdue":
        stmt = stmt.where(
            StudentFee.status == FeeStatus.pending,
            StudentFee.due_date < today,
        )
    elif status_filter == "outstanding":
        stmt = stmt.where(StudentFee.status == FeeStatus.pending)

    count = db.execute(
        select(func.count()).select_from(stmt.subquery())
    ).scalar_one()

    stmt = stmt.order_by(StudentFee.due_date.desc(), Student.full_name)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()

    items = []
    for sf, student, head, sec, cls in rows:
        items.append(_to_read_dict(sf, student, head, f"{cls.name} {sec.name}"))
    return items, count


def _to_read_dict(
    sf: StudentFee, student: Student, head: FeeHead, section_label: str
) -> dict:
    outstanding = sf.amount_due - sf.amount_paid
    is_overdue = (
        sf.status == FeeStatus.pending
        and sf.due_date < date.today()
        and outstanding > 0
    )
    return {
        "id": sf.id,
        "student_id": sf.student_id,
        "student_name": student.full_name,
        "section_label": section_label,
        "fee_head_id": sf.fee_head_id,
        "fee_head_name": head.name,
        "fee_head_code": head.code,
        "period": sf.period,
        "amount_due": sf.amount_due,
        "amount_paid": sf.amount_paid,
        "amount_outstanding": outstanding,
        "due_date": sf.due_date,
        "status": sf.status,
        "is_overdue": is_overdue,
        "paid_at": sf.paid_at,
        "payment_ref": sf.payment_ref,
        "payment_mode": sf.payment_mode,
        "notes": sf.notes,
    }


def get_student_fee(db: Session, fee_id: int, school_id: int) -> dict:
    sf = db.get(StudentFee, fee_id)
    if not sf or sf.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fee record not found"
        )
    student = db.get(Student, sf.student_id)
    head = db.get(FeeHead, sf.fee_head_id)
    sec = db.get(Section, student.section_id)
    cls = db.get(SchoolClass, sec.class_id) if sec else None
    label = f"{cls.name} {sec.name}" if cls and sec else None
    return _to_read_dict(sf, student, head, label)


def record_payment(
    db: Session,
    fee_id: int,
    school_id: int,
    data: RecordPayment,
    recorded_by_user_id: int,
) -> dict:
    sf = db.get(StudentFee, fee_id)
    if not sf or sf.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fee record not found"
        )
    # Lock the fee row: two payments at the same moment must not both pass the
    # outstanding check (the second waits here and then sees the first).
    db.refresh(sf, with_for_update=True)
    if sf.status == FeeStatus.waived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This fee has been waived",
        )

    new_paid = sf.amount_paid + data.amount_paid
    if new_paid > sf.amount_due:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Payment exceeds outstanding amount "
                f"(₹{sf.amount_due - sf.amount_paid})"
            ),
        )

    sf.amount_paid = new_paid
    sf.payment_mode = data.payment_mode
    # Keep what the fee already says (a concession, the store bill it came
    # from) unless this payment brings its own reference or note.
    if data.payment_ref:
        sf.payment_ref = data.payment_ref
    if data.notes:
        sf.notes = (f"{sf.notes} · {data.notes}" if sf.notes and data.notes not in sf.notes else data.notes)[:300]
    sf.recorded_by_user_id = recorded_by_user_id
    if new_paid >= sf.amount_due:
        sf.status = FeeStatus.paid
        sf.paid_at = data.paid_at or datetime.now(timezone.utc)
    # Keep each payment as its own receipt (amount_paid is only the total).
    ledger_service.record_collection(
        db,
        sf,
        data.amount_paid,
        ledger_service.mode_from_text(data.payment_mode),
        reference=data.payment_ref,
        on=(data.paid_at.date() if data.paid_at else None),
        actor_id=recorded_by_user_id,
        notes=data.notes,
    )
    db.commit()
    return get_student_fee(db, sf.id, school_id)


def waive(
    db: Session, fee_id: int, school_id: int, recorded_by_user_id: int
) -> dict:
    sf = db.get(StudentFee, fee_id)
    if not sf or sf.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fee record not found"
        )
    db.refresh(sf, with_for_update=True)
    if sf.status != FeeStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only an unpaid fee can be waived; this one is {sf.status.value}",
        )
    sf.status = FeeStatus.waived
    sf.recorded_by_user_id = recorded_by_user_id
    db.commit()
    return get_student_fee(db, sf.id, school_id)


def correct_charge(
    db: Session, fee_id: int, school_id: int, recorded_by_user_id: int, data: ChargeCorrection
) -> dict:
    """Fix a charge that was raised wrong — the amount, when it falls due, or
    the note explaining it. Only while nothing has been collected against it:
    once a rupee is in, the charge is part of a receipt and has to be refunded
    or waived rather than quietly rewritten.
    """
    sf = db.get(StudentFee, fee_id)
    if not sf or sf.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fee record not found"
        )
    if sf.status == FeeStatus.waived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This charge has been waived — it can't be corrected",
        )
    if sf.amount_paid and sf.amount_paid > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{sf.amount_paid} has already been collected against this charge — "
                "refund or waive it instead of changing it"
            ),
        )
    fields = data.model_dump(exclude_unset=True)
    if "amount_due" in fields:
        sf.amount_due = fields["amount_due"]
    if "due_date" in fields:
        sf.due_date = fields["due_date"]
    if "notes" in fields:
        sf.notes = (fields["notes"] or "").strip() or None
    sf.recorded_by_user_id = recorded_by_user_id
    db.commit()
    return get_student_fee(db, sf.id, school_id)


# ----- Parent-facing helpers -----

def list_child_fees(
    db: Session, parent_user_id: int, student_id: int
) -> list[dict]:
    from app.models.parent import ParentStudent

    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )

    rows = db.execute(
        select(StudentFee, Student, FeeHead, Section, SchoolClass)
        .join(Student, StudentFee.student_id == Student.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .join(Section, Student.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(StudentFee.student_id == student_id)
        .order_by(StudentFee.due_date.desc())
    ).all()

    out = []
    for sf, student, head, sec, cls in rows:
        out.append(_to_read_dict(sf, student, head, f"{cls.name} {sec.name}"))
    return out


def child_pending_total(db: Session, student_id: int) -> Decimal:
    total = db.execute(
        select(
            func.coalesce(
                func.sum(StudentFee.amount_due - StudentFee.amount_paid), 0
            )
        ).where(
            StudentFee.student_id == student_id,
            StudentFee.status == FeeStatus.pending,
        )
    ).scalar_one()
    return total
