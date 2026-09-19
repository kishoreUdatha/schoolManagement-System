"""Enrolment history, guardians, terms and departments."""
from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import EnrollmentOutcome, GuardianRelation, ParentRelation, UserRole
from app.core.scoping import require_linked_child, section_label, section_labels
from app.models.academic import AcademicYear
from app.models.foundation import Department, Guardian, StudentEnrollment, StudentGuardian, Term
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# --- Enrolment history ---

def sync_enrollment(db: Session, s: Student, *, previous_outcome: EnrollmentOutcome = EnrollmentOutcome.promoted,
                    note: Optional[str] = None) -> StudentEnrollment:
    """Make the history match the student's current placement. Flushes only;
    the caller commits. Called after create / promote / section change /
    (de)activation so the Student row and its history never drift."""
    today = date.today()
    rows = list(db.execute(select(StudentEnrollment).where(StudentEnrollment.student_id == s.id)).scalars())
    current = next((r for r in rows if r.academic_year_id == s.academic_year_id), None)
    for r in rows:
        if r is not current and r.end_date is None:
            r.end_date = today
            if r.outcome == EnrollmentOutcome.studying:
                r.outcome = previous_outcome
    if current is None:
        year = db.get(AcademicYear, s.academic_year_id)
        # Promoted ahead of the new year: the enrolment starts when the year does.
        start = year.start_date if year and year.start_date and today < year.start_date else today
        current = StudentEnrollment(
            tenant_id=s.tenant_id, school_id=s.school_id, student_id=s.id, academic_year_id=s.academic_year_id,
            section_id=s.section_id, roll_no=s.roll_no, start_date=start, outcome=EnrollmentOutcome.studying, notes=note,
        )
        db.add(current)
    else:
        if current.section_id != s.section_id:
            moved = f"Moved from {section_label(db, current.section_id)} on {today:%d %b %Y}"
            current.notes = "; ".join(x for x in (current.notes, note or moved) if x)[:300]
            current.section_id = s.section_id
        current.roll_no = s.roll_no
    if not s.is_active:
        if current.end_date is None:
            current.end_date = today
        current.outcome = EnrollmentOutcome.left
    elif current.outcome == EnrollmentOutcome.left:
        current.outcome, current.end_date = EnrollmentOutcome.studying, None
    db.flush()
    return current


def history(db: Session, student: Student) -> list[dict]:
    rows = list(db.execute(
        select(StudentEnrollment, AcademicYear.name)
        .join(AcademicYear, StudentEnrollment.academic_year_id == AcademicYear.id)
        .where(StudentEnrollment.student_id == student.id)
        .order_by(StudentEnrollment.start_date.desc())
    ).all())
    labels = section_labels(db, {e.section_id for e, _ in rows})
    return [
        {"id": e.id, "academic_year_id": e.academic_year_id, "academic_year_name": y, "section_id": e.section_id,
         "section_label": labels.get(e.section_id), "roll_no": e.roll_no, "start_date": e.start_date,
         "end_date": e.end_date, "outcome": e.outcome, "notes": e.notes}
        for e, y in rows
    ]


def set_outcome(db: Session, enrollment_id: int, school_id: int, outcome: EnrollmentOutcome) -> StudentEnrollment:
    """Correct a past year's result (e.g. 'repeated' instead of 'promoted')."""
    e = db.get(StudentEnrollment, enrollment_id)
    if not e or e.school_id != school_id:
        raise _404("Enrolment")
    if e.end_date is None and outcome != EnrollmentOutcome.studying:
        raise _400("The current year is still in progress")
    e.outcome = outcome
    db.commit()
    db.refresh(e)
    return e


def year_roster(db: Session, school_id: int, academic_year_id: int, section_id: Optional[int] = None) -> list[dict]:
    """Who was in a class in a given (possibly past) year."""
    stmt = (
        select(StudentEnrollment, Student)
        .join(Student, StudentEnrollment.student_id == Student.id)
        .where(StudentEnrollment.school_id == school_id, StudentEnrollment.academic_year_id == academic_year_id)
    )
    if section_id:
        stmt = stmt.where(StudentEnrollment.section_id == section_id)
    rows = db.execute(stmt.order_by(StudentEnrollment.section_id, StudentEnrollment.roll_no)).all()
    labels = section_labels(db, {e.section_id for e, _ in rows})
    return [
        {"student_id": s.id, "full_name": s.full_name, "admission_no": s.admission_no, "section_label": labels.get(e.section_id),
         "roll_no": e.roll_no, "outcome": e.outcome, "start_date": e.start_date, "end_date": e.end_date}
        for e, s in rows
    ]


# --- Guardians ---

_PARENT_TO_GUARDIAN = {
    ParentRelation.father: GuardianRelation.father,
    ParentRelation.mother: GuardianRelation.mother,
    ParentRelation.guardian: GuardianRelation.guardian,
    ParentRelation.other: GuardianRelation.other,
}
_GUARDIAN_TO_PARENT = {v: k for k, v in _PARENT_TO_GUARDIAN.items()}


def on_parent_linked(db: Session, parent: User, student: Student, relation: ParentRelation) -> None:
    """Keep guardians in step when a parent login is created or linked. Flush only."""
    g = db.execute(select(Guardian).where(Guardian.user_id == parent.id)).scalar_one_or_none()
    if g is None:
        g = Guardian(tenant_id=student.tenant_id, school_id=student.school_id, full_name=parent.full_name,
                     phone=parent.phone, email=parent.email, user_id=parent.id)
        db.add(g)
        db.flush()
    link = db.execute(select(StudentGuardian).where(StudentGuardian.student_id == student.id, StudentGuardian.guardian_id == g.id)).scalar_one_or_none()
    if link is None:
        has_primary = db.execute(select(StudentGuardian.id).where(StudentGuardian.student_id == student.id, StudentGuardian.is_primary.is_(True))).first()
        db.add(StudentGuardian(student_id=student.id, guardian_id=g.id, relation=_PARENT_TO_GUARDIAN[relation], is_primary=not has_primary))
    db.flush()


def on_parent_unlinked(db: Session, parent_user_id: int, student_id: int) -> None:
    g = db.execute(select(Guardian).where(Guardian.user_id == parent_user_id)).scalar_one_or_none()
    if g:
        db.execute(StudentGuardian.__table__.delete().where(StudentGuardian.student_id == student_id, StudentGuardian.guardian_id == g.id))
        db.flush()


def guardians_of(db: Session, student_id: int) -> list[dict]:
    rows = db.execute(
        select(StudentGuardian, Guardian).join(Guardian, StudentGuardian.guardian_id == Guardian.id)
        .where(StudentGuardian.student_id == student_id)
        .order_by(StudentGuardian.is_primary.desc(), Guardian.full_name)
    ).all()
    return [
        {"guardian_id": g.id, "link_id": l.id, "full_name": g.full_name, "phone": g.phone, "email": g.email,
         "occupation": g.occupation, "address": g.address, "relation": l.relation, "is_primary": l.is_primary,
         "can_pickup": l.can_pickup, "is_emergency_contact": l.is_emergency_contact,
         "lives_with_student": l.lives_with_student, "has_portal_login": g.user_id is not None}
        for l, g in rows
    ]


def _set_primary(db: Session, student_id: int, link: StudentGuardian) -> None:
    db.execute(StudentGuardian.__table__.update().where(
        StudentGuardian.student_id == student_id, StudentGuardian.id != link.id
    ).values(is_primary=False))
    link.is_primary = True


def add_guardian(db: Session, student: Student, data) -> StudentGuardian:
    if data.guardian_id:
        g = db.get(Guardian, data.guardian_id)
        if not g or g.school_id != student.school_id:
            raise _404("Guardian")
    else:
        if not (data.full_name or "").strip():
            raise _400("Name is required")
        if not (data.phone or "").strip():
            raise _400("A phone number is required for a guardian")
        g = Guardian(tenant_id=student.tenant_id, school_id=student.school_id, full_name=data.full_name.strip(),
                     phone=data.phone.strip(), email=(data.email or "").strip() or None, occupation=data.occupation,
                     address=data.address)
        db.add(g)
        db.flush()
    if db.execute(select(StudentGuardian.id).where(StudentGuardian.student_id == student.id, StudentGuardian.guardian_id == g.id)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{g.full_name} is already listed")
    link = StudentGuardian(student_id=student.id, guardian_id=g.id, relation=data.relation, can_pickup=data.can_pickup,
                           is_emergency_contact=data.is_emergency_contact, lives_with_student=data.lives_with_student,
                           is_primary=False)
    db.add(link)
    db.flush()
    has_primary = db.execute(select(StudentGuardian.id).where(StudentGuardian.student_id == student.id, StudentGuardian.is_primary.is_(True))).first()
    if data.is_primary or not has_primary:
        _set_primary(db, student.id, link)
    db.commit()
    db.refresh(link)
    return link


def _link(db: Session, student_id: int, guardian_id: int) -> tuple[StudentGuardian, Guardian]:
    row = db.execute(select(StudentGuardian, Guardian).join(Guardian, StudentGuardian.guardian_id == Guardian.id).where(
        StudentGuardian.student_id == student_id, StudentGuardian.guardian_id == guardian_id)).first()
    if not row:
        raise _404("Guardian")
    return row


def update_guardian(db: Session, student: Student, guardian_id: int, data) -> None:
    link, g = _link(db, student.id, guardian_id)
    updates = data.model_dump(exclude_unset=True)
    for k in ("full_name", "phone", "email", "occupation", "address"):
        if k in updates:
            v = updates[k]
            if g.user_id and k == "email" and v != g.email:
                raise _400("This guardian signs in with that email; change it from the Parents page")
            setattr(g, k, (v.strip() or None) if isinstance(v, str) else v)
    for k in ("relation", "can_pickup", "is_emergency_contact", "lives_with_student"):
        if k in updates and updates[k] is not None:
            setattr(link, k, updates[k])
    if updates.get("is_primary"):
        _set_primary(db, student.id, link)
    db.commit()


def remove_guardian(db: Session, student: Student, guardian_id: int) -> None:
    link, g = _link(db, student.id, guardian_id)
    if g.user_id:
        raise _400("This guardian has a parent login; unlink them from the Parents page instead")
    was_primary = link.is_primary
    db.delete(link)
    db.flush()
    if was_primary:
        nxt = db.execute(select(StudentGuardian).where(StudentGuardian.student_id == student.id).order_by(StudentGuardian.id)).scalars().first()
        if nxt:
            nxt.is_primary = True
    if not db.execute(select(StudentGuardian.id).where(StudentGuardian.guardian_id == g.id)).first():
        db.delete(g)  # no other children, nothing left to keep
    db.commit()


def grant_portal(db: Session, user: User, student: Student, guardian_id: int) -> tuple[User, str]:
    """Create a parent login for a guardian who doesn't have one yet."""
    from app.schemas.parent import ParentCreate
    from app.services import parent_service

    link, g = _link(db, student.id, guardian_id)
    if g.user_id:
        raise _400("This guardian already has a login")
    if not g.email:
        raise _400("Add the guardian's email first; it's their login")
    relation = _GUARDIAN_TO_PARENT.get(link.relation, ParentRelation.other)
    guardian_id_keep = g.id
    parent, password = parent_service.create_parent(
        db, user.tenant_id, user.school_id,
        ParentCreate(full_name=g.full_name, email=g.email, phone=g.phone, student_id=student.id, relation=relation),
    )
    g = db.get(Guardian, guardian_id_keep)
    # create_parent made its own guardian row via on_parent_linked; fold it into this one.
    dup = db.execute(select(Guardian).where(Guardian.user_id == parent.id)).scalar_one_or_none()
    if dup and dup.id != g.id:
        db.execute(StudentGuardian.__table__.delete().where(StudentGuardian.guardian_id == dup.id))
        db.delete(dup)
        db.flush()
    g.user_id = parent.id
    db.commit()
    # Link the login to the guardian's other children as well.
    for (sid,) in db.execute(select(StudentGuardian.student_id).where(StudentGuardian.guardian_id == g.id, StudentGuardian.student_id != student.id)).all():
        if not db.execute(select(ParentStudent.id).where(ParentStudent.parent_user_id == parent.id, ParentStudent.student_id == sid)).first():
            db.add(ParentStudent(tenant_id=g.tenant_id, school_id=g.school_id, parent_user_id=parent.id, student_id=sid, relation=relation))
    db.commit()
    return parent, password


def pickup_allowed(db: Session, student_id: int, name: str) -> Optional[dict]:
    """Is someone with this name listed as allowed to collect the student?"""
    n = " ".join(name.lower().split())
    for g in guardians_of(db, student_id):
        if g["can_pickup"] and " ".join(g["full_name"].lower().split()) == n:
            return g
    return None


# --- Terms ---

def _year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    y = db.get(AcademicYear, year_id)
    if not y or y.school_id != school_id:
        raise _404("Academic year")
    return y


def list_terms(db: Session, school_id: int, year_id: int) -> list[Term]:
    _year(db, year_id, school_id)
    return list(db.execute(select(Term).where(Term.academic_year_id == year_id).order_by(Term.sequence)).scalars())


def _check_term(db: Session, year: AcademicYear, start: date, end: date, exclude_id: Optional[int] = None) -> None:
    if end < start:
        raise _400("Term ends before it starts")
    if year.start_date and year.end_date and (start < year.start_date or end > year.end_date):
        raise _400(f"Term must fall within {year.name} ({year.start_date:%d %b %Y} to {year.end_date:%d %b %Y})")
    clash = db.execute(select(Term.name).where(
        Term.academic_year_id == year.id, Term.id != (exclude_id or 0), Term.start_date <= end, Term.end_date >= start,
    )).scalars().first()
    if clash:
        raise _400(f"Overlaps {clash}")


def save_term(db: Session, user: User, year_id: int, data, term_id: Optional[int] = None) -> Term:
    year = _year(db, year_id, user.school_id)
    if term_id:
        t = db.get(Term, term_id)
        if not t or t.academic_year_id != year.id:
            raise _404("Term")
    else:
        t = Term(tenant_id=user.tenant_id, school_id=user.school_id, academic_year_id=year.id)
    _check_term(db, year, data.start_date, data.end_date, term_id)
    t.name, t.start_date, t.end_date = data.name.strip(), data.start_date, data.end_date
    if term_id is None:
        t.sequence = (db.execute(select(func.coalesce(func.max(Term.sequence), 0)).where(Term.academic_year_id == year.id)).scalar_one()) + 1
        db.add(t)
    db.flush()
    # Keep sequence = chronological order (two passes to dodge the unique constraint).
    ordered = list(db.execute(select(Term).where(Term.academic_year_id == year.id).order_by(Term.start_date)).scalars())
    for i, x in enumerate(ordered, start=1):
        x.sequence = -i
    db.flush()
    for x in ordered:
        x.sequence = -x.sequence
    db.commit()
    db.refresh(t)
    return t


def delete_term(db: Session, user: User, term_id: int) -> None:
    from app.models.exam import Exam

    t = db.get(Term, term_id)
    if not t or t.school_id != user.school_id:
        raise _404("Term")
    if db.execute(select(Exam.id).where(Exam.term_id == t.id)).first():
        raise _400("Exams are filed under this term; move them first")
    db.delete(t)
    db.commit()


def current_term(db: Session, school_id: int, on: Optional[date] = None) -> Optional[Term]:
    on = on or date.today()
    return db.execute(select(Term).where(Term.school_id == school_id, Term.start_date <= on, Term.end_date >= on)).scalars().first()


def check_term(db: Session, school_id: int, year_id: int, term_id: Optional[int]) -> None:
    if term_id is None:
        return
    t = db.get(Term, term_id)
    if not t or t.school_id != school_id or t.academic_year_id != year_id:
        raise _400("Term doesn't belong to this academic year")


# --- Departments ---

def list_departments(db: Session, school_id: int) -> list[Department]:
    return list(db.execute(select(Department).where(Department.school_id == school_id).order_by(Department.is_active.desc(), Department.name)).scalars())


def save_department(db: Session, user: User, data, dept_id: Optional[int] = None) -> Department:
    if dept_id:
        d = db.get(Department, dept_id)
        if not d or d.school_id != user.school_id:
            raise _404("Department")
    else:
        d = Department(tenant_id=user.tenant_id, school_id=user.school_id)
    if data.head_user_id is not None:
        u = db.get(User, data.head_user_id)
        if not u or u.school_id != user.school_id or u.role in (UserRole.parent, UserRole.student):
            raise _404("Head of department")
    d.name, d.code, d.head_user_id, d.is_active = data.name.strip(), data.code.strip().upper(), data.head_user_id, data.is_active
    if dept_id is None:
        db.add(d)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Department code {data.code} is already used")
    db.refresh(d)
    return d


def check_department(db: Session, school_id: int, dept_id: Optional[int]) -> None:
    if dept_id is None:
        return
    d = db.get(Department, dept_id)
    if not d or d.school_id != school_id:
        raise _404("Department")


def department_to_read(db: Session, d: Department) -> dict:
    from app.models.staff import Staff
    from app.models.subject import Subject

    head = db.get(User, d.head_user_id) if d.head_user_id else None
    return {
        "id": d.id, "name": d.name, "code": d.code, "head_user_id": d.head_user_id,
        "head_name": head.full_name if head else None, "is_active": d.is_active,
        "staff_count": db.execute(select(func.count(Staff.id)).where(Staff.department_id == d.id)).scalar_one(),
        "subject_count": db.execute(select(func.count(Subject.id)).where(Subject.department_id == d.id)).scalar_one(),
    }


def parent_child(db: Session, parent_user_id: int, student_id: int) -> Student:
    return require_linked_child(db, parent_user_id, student_id)
