from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from decimal import Decimal

from app.core.enums import EnrollmentOutcome, FeeStatus, SubscriptionStatus
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.plan import Plan
from app.models.student import Student
from app.models.subscription import TenantSubscription
from app.schemas.student import StudentBase, StudentBulkRow, StudentCreate, StudentUpdate, TransferOut
from app.services import foundation_service


# --- Quota ---

def _check_student_quota(db: Session, tenant_id: int, *, adding: int = 1) -> None:
    sub = db.execute(
        select(TenantSubscription)
        .where(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status == SubscriptionStatus.active,
        )
        .order_by(TenantSubscription.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not sub:
        return
    plan = db.get(Plan, sub.plan_id)
    if not plan or plan.student_limit == 0:
        return
    current = db.execute(
        select(func.count(Student.id)).where(
            Student.tenant_id == tenant_id, Student.is_active.is_(True)
        )
    ).scalar_one()
    if current + adding > plan.student_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Plan limit reached: {plan.student_limit} students. "
                f"You have {current}, requested {adding} more. Upgrade the plan."
            ),
        )


# --- Lookups ---

def _get_section_with_class(
    db: Session, section_id: int, school_id: int
) -> tuple[Section, SchoolClass]:
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    cls = db.get(SchoolClass, sec.class_id)
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class not found"
        )
    return sec, cls


def _get_year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    y = db.get(AcademicYear, year_id)
    if not y or y.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found"
        )
    if y.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot enroll into an archived academic year",
        )
    return y


def _get_student(db: Session, student_id: int, school_id: int) -> Student:
    s = db.get(Student, student_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s


# --- Auto-generation ---

def _next_admission_no(db: Session, school_id: int) -> str:
    last = db.execute(
        select(Student.admission_no)
        .where(Student.school_id == school_id, Student.admission_no.like("S%"))
        .order_by(Student.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    seq = 1
    if last and last.startswith("S") and last[1:].isdigit():
        seq = int(last[1:]) + 1
    return f"S{seq:05d}"


def _next_roll_no(db: Session, section_id: int, academic_year_id: int) -> int:
    max_roll = db.execute(
        select(func.coalesce(func.max(Student.roll_no), 0)).where(
            Student.section_id == section_id,
            Student.academic_year_id == academic_year_id,
        )
    ).scalar_one()
    return int(max_roll) + 1


# --- Capacity check ---

def _check_capacity(
    db: Session, section_id: int, academic_year_id: int, capacity: int
) -> None:
    if capacity <= 0:
        return
    current = db.execute(
        select(func.count(Student.id)).where(
            Student.section_id == section_id,
            Student.academic_year_id == academic_year_id,
            Student.is_active.is_(True),
        )
    ).scalar_one()
    if current >= capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Section is full ({current}/{capacity}). "
                "Increase capacity or pick a different section."
            ),
        )


# --- CRUD ---

def create_student(
    db: Session, tenant_id: int, school_id: int, data: StudentCreate
) -> Student:
    _check_student_quota(db, tenant_id)
    year = _get_year(db, data.academic_year_id, school_id)
    sec, cls = _get_section_with_class(db, data.section_id, school_id)
    if cls.academic_year_id != year.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section's class belongs to a different academic year",
        )
    _check_capacity(db, sec.id, year.id, sec.capacity)

    admission_no = (data.admission_no or _next_admission_no(db, school_id)).strip()
    roll_no = data.roll_no or _next_roll_no(db, sec.id, year.id)

    s = Student(
        tenant_id=tenant_id,
        school_id=school_id,
        admission_no=admission_no,
        full_name=data.full_name.strip(),
        dob=data.dob,
        gender=data.gender,
        blood_group=data.blood_group,
        photo_url=data.photo_url,
        address=data.address,
        academic_year_id=year.id,
        section_id=sec.id,
        roll_no=roll_no,
        is_active=True,
    )
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Admission number '{admission_no}' already exists, "
                f"or roll number {roll_no} is taken in this section"
            ),
        )
    db.refresh(s)
    foundation_service.sync_enrollment(db, s, note="Admitted")
    db.commit()

    # Story 2.9 hook: generate one-time fees (e.g. Admission Fee) for this student
    from app.services import fee_service  # local to avoid cycle
    fee_service.generate_one_time_for_student(db, tenant_id, school_id, s)

    return s


def bulk_create(
    db: Session,
    tenant_id: int,
    school_id: int,
    academic_year_id: int,
    section_id: int,
    rows: list[StudentBulkRow],
) -> tuple[list[Student], list[dict]]:
    year = _get_year(db, academic_year_id, school_id)
    sec, cls = _get_section_with_class(db, section_id, school_id)
    if cls.academic_year_id != year.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section's class belongs to a different academic year",
        )

    # Per-row validation BEFORE quota/capacity checks so the counts use only
    # rows that would actually be inserted.
    cleaned: list[tuple[int, StudentBulkRow]] = []
    errors: list[dict] = []
    seen_names: set[str] = set()
    for idx, row in enumerate(rows):
        name = (row.full_name or "").strip()
        if not name or len(name) < 2:
            errors.append(
                {"row": idx, "full_name": row.full_name, "error": "Missing or too-short full_name"}
            )
            continue
        key = name.lower()
        if key in seen_names:
            errors.append(
                {"row": idx, "full_name": name, "error": "Duplicate name within this upload"}
            )
            continue
        seen_names.add(key)
        cleaned.append((idx, row))

    if not cleaned:
        return [], errors

    _check_student_quota(db, tenant_id, adding=len(cleaned))

    if sec.capacity > 0:
        current = db.execute(
            select(func.count(Student.id)).where(
                Student.section_id == sec.id,
                Student.academic_year_id == year.id,
                Student.is_active.is_(True),
            )
        ).scalar_one()
        if current + len(cleaned) > sec.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Bulk import would exceed section capacity "
                    f"({current}+{len(cleaned)} > {sec.capacity})"
                ),
            )

    created: list[Student] = []
    next_roll = _next_roll_no(db, sec.id, year.id)
    for idx, row in cleaned:
        name = row.full_name.strip()
        admission_no = _next_admission_no(db, school_id)
        student = Student(
            tenant_id=tenant_id,
            school_id=school_id,
            admission_no=admission_no,
            full_name=name,
            dob=row.dob,
            gender=row.gender,
            blood_group=row.blood_group,
            photo_url=row.photo_url,
            address=row.address,
            academic_year_id=year.id,
            section_id=sec.id,
            roll_no=next_roll,
            is_active=True,
        )
        try:
            with db.begin_nested():
                db.add(student)
                db.flush()
            created.append(student)
            next_roll += 1
        except IntegrityError as e:
            msg = str(e.orig) if e.orig else "Insert failed"
            if "admission_no" in msg:
                detail = f"Admission # '{admission_no}' already exists"
            elif "roll" in msg:
                detail = f"Roll # {next_roll} already taken in this section"
            else:
                detail = "Insert failed (duplicate)"
            errors.append({"row": idx, "full_name": name, "error": detail})
    db.commit()
    for s in created:
        db.refresh(s)
        foundation_service.sync_enrollment(db, s, note="Admitted (bulk import)")
    db.commit()

    # Story 2.9 hook: one-time fees for each newly-admitted student
    from app.services import fee_service
    for s in created:
        fee_service.generate_one_time_for_student(db, tenant_id, school_id, s)

    # The parents each row named. A child stays imported even when a parent
    # will not save; the reason is reported against that row.
    from app.schemas.foundation import GuardianIn

    by_name = {s.full_name.strip().lower(): s for s in created}
    for idx, row in cleaned:
        student = by_name.get((row.full_name or "").strip().lower())
        if not student:
            continue
        for g in row.guardians():
            try:
                foundation_service.add_guardian(db, student, GuardianIn(**g))
            except HTTPException as e:
                errors.append({"row": idx, "full_name": row.full_name, "error": f"{g['full_name']}: {e.detail}"})

    return created, errors


# What makes a record worth keeping. Every one of these tables cascades on
# delete, so a child with any of it must be taken off the roll instead: the
# school would otherwise lose the register, the marks and the receipts.
HISTORY: tuple[tuple[str, str, str], ...] = (
    ("student_attendance", "student_id", "attendance"),
    ("period_attendance", "student_id", "lesson attendance"),
    ("marks", "student_id", "marks"),
    ("fee_collections", "student_id", "fee payments"),
    ("library_loans", "student_id", "library loans"),
    ("homework_submissions", "student_id", "homework"),
    ("certificate_issues", "student_id", "certificates"),
    ("discipline_incidents", "student_id", "behaviour records"),
    ("clinic_visits", "student_id", "clinic visits"),
    ("test_attempts", "student_id", "online tests"),
)


def history_of(db: Session, student_id: int) -> list[str]:
    """What this child has on record, in plain words."""
    from sqlalchemy import text as sql

    found = []
    for table, column, what in HISTORY:
        n = db.execute(sql(f"SELECT count(*) FROM {table} WHERE {column} = :id"), {"id": student_id}).scalar_one()
        if n:
            found.append(f"{n} {what}")
    return found


def delete_student(db: Session, student_id: int, school_id: int) -> str:
    """Remove a record added by mistake. A child the school has any history
    for cannot be deleted — that is what taking them off the roll is for."""
    s = get_student(db, student_id, school_id)
    kept = history_of(db, s.id)
    if kept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{s.full_name} has {', '.join(kept)} on record. Deleting would take all of it with them — "
                "take them off the roll instead."
            ),
        )
    name = s.full_name
    db.delete(s)
    db.commit()
    return name


def promote_students(
    db: Session,
    tenant_id: int,
    school_id: int,
    source_section_id: int,
    target_section_id: int,
    student_ids: Optional[list[int]] = None,
) -> tuple[list[Student], list[dict]]:
    """Move students from source section into target section in the target year.

    History note: per-record snapshots (StudentAttendance.section_id, etc.)
    still reference the OLD section_id, so historical reports continue to
    work. The Student row itself is mutated to reflect current placement.
    """
    if source_section_id == target_section_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target section must differ",
        )

    src_sec, src_cls = _get_section_with_class(db, source_section_id, school_id)
    tgt_sec, tgt_cls = _get_section_with_class(db, target_section_id, school_id)

    src_year = _get_year(db, src_cls.academic_year_id, school_id)
    tgt_year = _get_year(db, tgt_cls.academic_year_id, school_id)

    if src_year.id == tgt_year.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Source and target sections are in the same academic year. "
                "Use edit-student to transfer within a year."
            ),
        )

    # Load candidates: active students in source section + year
    stmt = select(Student).where(
        Student.school_id == school_id,
        Student.section_id == source_section_id,
        Student.academic_year_id == src_year.id,
        Student.is_active.is_(True),
    )
    if student_ids:
        stmt = stmt.where(Student.id.in_(student_ids))
    candidates = list(db.execute(stmt).scalars().all())

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No matching students found in the source section",
        )

    # Capacity guard
    if tgt_sec.capacity > 0:
        current = db.execute(
            select(func.count(Student.id)).where(
                Student.section_id == tgt_sec.id,
                Student.academic_year_id == tgt_year.id,
                Student.is_active.is_(True),
            )
        ).scalar_one()
        if current + len(candidates) > tgt_sec.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Target section is full ({current}/{tgt_sec.capacity}); "
                    f"promoting {len(candidates)} would exceed capacity"
                ),
            )

    next_roll = _next_roll_no(db, tgt_sec.id, tgt_year.id)
    promoted: list[Student] = []
    errors: list[dict] = []

    for s in candidates:
        try:
            with db.begin_nested():
                s.section_id = tgt_sec.id
                s.academic_year_id = tgt_year.id
                s.roll_no = next_roll
                db.flush()
            promoted.append(s)
            next_roll += 1
        except IntegrityError:
            errors.append(
                {
                    "student_id": s.id,
                    "admission_no": s.admission_no,
                    "full_name": s.full_name,
                    "error": "Roll # collision in target section",
                }
            )

    for s in promoted:
        foundation_service.sync_enrollment(db, s, note=f"Promoted from {src_cls.name} {src_sec.name}")
    db.commit()
    for s in promoted:
        db.refresh(s)
    return promoted, errors


def list_students(
    db: Session,
    school_id: int,
    *,
    academic_year_id: Optional[int] = None,
    class_id: Optional[int] = None,
    section_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Student], int]:
    stmt = select(Student).where(Student.school_id == school_id)
    if academic_year_id:
        stmt = stmt.where(Student.academic_year_id == academic_year_id)
    if section_id:
        stmt = stmt.where(Student.section_id == section_id)
    elif class_id:
        # Filter by class via section
        stmt = stmt.join(Section, Student.section_id == Section.id).where(
            Section.class_id == class_id
        )
    if status_filter == "active":
        stmt = stmt.where(Student.is_active.is_(True))
    elif status_filter == "inactive":
        stmt = stmt.where(Student.is_active.is_(False))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Student.full_name.ilike(like),
                Student.admission_no.ilike(like),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar_one()

    stmt = stmt.order_by(Student.section_id, Student.roll_no, Student.full_name)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = list(db.execute(stmt).scalars().all())
    return items, total


def get_student(db: Session, student_id: int, school_id: int) -> Student:
    return _get_student(db, student_id, school_id)


def update_student(
    db: Session, student_id: int, school_id: int, data: StudentUpdate
) -> Student:
    s = _get_student(db, student_id, school_id)
    updates = data.model_dump(exclude_unset=True)

    if "section_id" in updates and updates["section_id"] is not None:
        sec, cls = _get_section_with_class(db, updates["section_id"], school_id)
        if cls.academic_year_id != s.academic_year_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move student to a section in a different academic year",
            )
        _check_capacity(db, sec.id, s.academic_year_id, sec.capacity)

    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip() if field != "address" else value
        setattr(s, field, value)

    try:
        db.flush()
        if "section_id" in updates or "roll_no" in updates:
            foundation_service.sync_enrollment(db, s)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Roll number already taken in this section",
        )
    db.refresh(s)
    return s


def set_active(
    db: Session, student_id: int, school_id: int, *, active: bool
) -> Student:
    s = _get_student(db, student_id, school_id)
    s.is_active = active
    foundation_service.sync_enrollment(db, s)
    db.commit()
    db.refresh(s)
    return s


def transfer_out(db: Session, student_id: int, school_id: int, user, data: TransferOut) -> dict:
    """A child leaving for another school.

    Leaving is not the same as being deactivated: the school has to say where
    the child went and when, the enrolment closes as 'left' rather than just
    stopping, and anything still owed is reported so the office can settle it
    before the transfer certificate goes out. The record stays — a school that
    is asked for a duplicate TC in five years has to be able to answer.
    """
    s = _get_student(db, student_id, school_id)
    if not s.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{s.full_name} has already left",
        )
    left_on = data.left_on or date.today()
    if left_on > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The leaving date is in the future"
        )

    from app.models.fee import StudentFee

    dues = db.execute(
        select(func.coalesce(func.sum(StudentFee.amount_due - StudentFee.amount_paid), 0))
        .where(
            StudentFee.student_id == s.id,
            StudentFee.status.notin_([FeeStatus.paid, FeeStatus.waived]),
        )
    ).scalar_one()
    if dues and dues > 0 and not data.ignore_dues:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{s.full_name} still owes {dues}. Settle or waive it first, "
                "or confirm the transfer anyway."
            ),
        )

    s.is_active = False
    note = f"Left on {left_on:%d %b %Y} for {data.to_school.strip()}"
    if data.reason:
        note += f" — {data.reason.strip()}"
    s.address = s.address  # untouched; the note belongs on the enrolment
    closed = foundation_service.close_enrollment(db, s, outcome=EnrollmentOutcome.left, end_date=left_on, note=note)
    if data.remarks and data.remarks.strip():
        closed.exit_remarks = data.remarks.strip()
    db.commit()
    db.refresh(s)
    return {
        "student_id": s.id,
        "student_name": s.full_name,
        "admission_no": s.admission_no,
        "left_on": left_on,
        "to_school": data.to_school.strip(),
        "outstanding_dues": Decimal(dues or 0),
        "note": note,
    }


# --- Helpers exposed to other services ---

def class_has_active_students(db: Session, class_id: int) -> int:
    return db.execute(
        select(func.count(Student.id))
        .join(Section, Student.section_id == Section.id)
        .where(Section.class_id == class_id, Student.is_active.is_(True))
    ).scalar_one()


def section_has_active_students(db: Session, section_id: int) -> int:
    return db.execute(
        select(func.count(Student.id)).where(
            Student.section_id == section_id, Student.is_active.is_(True)
        )
    ).scalar_one()


def year_has_students(db: Session, academic_year_id: int) -> int:
    return db.execute(
        select(func.count(Student.id)).where(
            Student.academic_year_id == academic_year_id
        )
    ).scalar_one()
