from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import ClinicOutcome
from app.core.scoping import get_school_student, require_linked_child, section_label, section_labels
from app.models.health import ClinicVisit, HealthCheckup, Immunization, MedicalProfile
from app.models.student import Student
from app.models.user import User
from app.schemas.health import CheckupIn, ImmunizationIn, ImmunizationRead, ProfileIn, VisitIn


OUTCOME_TEXT = {
    ClinicOutcome.back_to_class: "was checked and went back to class",
    ClinicOutcome.rested: "rested in the sick room and then went back to class",
    ClinicOutcome.sent_home: "was sent home",
    ClinicOutcome.parent_picked_up: "was picked up by a parent",
    ClinicOutcome.referred_hospital: "was referred to a hospital",
}


def _profile(db: Session, student: Student) -> Optional[MedicalProfile]:
    return db.execute(select(MedicalProfile).where(MedicalProfile.student_id == student.id)).scalar_one_or_none()


def profile_to_read(db: Session, student: Student, p: Optional[MedicalProfile]) -> dict:
    d = {k: getattr(p, k) if p else None for k in ProfileIn.model_fields}
    who = db.get(User, p.updated_by_user_id) if p and p.updated_by_user_id else None
    d.update(
        student_id=student.id,
        blood_group=student.blood_group,
        updated_at=p.updated_at if p else None,
        updated_by_name=who.full_name if who else None,
    )
    return d


def save_profile(db: Session, student: Student, actor_id: int, data: ProfileIn) -> MedicalProfile:
    p = _profile(db, student)
    if p is None:
        p = MedicalProfile(tenant_id=student.tenant_id, school_id=student.school_id, student_id=student.id)
        db.add(p)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(p, k, (v.strip() or None) if isinstance(v, str) else v)
    p.updated_by_user_id = actor_id
    db.commit()
    db.refresh(p)
    return p


def _bmi(c: HealthCheckup) -> Optional[Decimal]:
    if c.height_cm and c.weight_kg:
        m = Decimal(c.height_cm) / 100
        return (Decimal(c.weight_kg) / (m * m)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return None


def checkup_to_read(c: HealthCheckup) -> dict:
    d = {k: getattr(c, k) for k in CheckupIn.model_fields}
    d.update(id=c.id, student_id=c.student_id, bmi=_bmi(c))
    return d


def add_checkup(db: Session, student: Student, actor_id: int, data: CheckupIn) -> HealthCheckup:
    if data.checked_on > date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checkup date is in the future")
    c = HealthCheckup(
        tenant_id=student.tenant_id, school_id=student.school_id, student_id=student.id,
        recorded_by_user_id=actor_id, **data.model_dump(),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def add_immunization(db: Session, student: Student, actor_id: int, data: ImmunizationIn) -> Immunization:
    if data.given_on and data.next_due_on and data.next_due_on <= data.given_on:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Next dose must be after the given date")
    i = Immunization(
        tenant_id=student.tenant_id, school_id=student.school_id, student_id=student.id,
        recorded_by_user_id=actor_id, **data.model_dump(),
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


def delete_row(db: Session, model, row_id: int, school_id: int) -> None:
    row = db.get(model, row_id)
    if not row or row.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    db.delete(row)
    db.commit()


# --- Clinic visits ---

def record_visit(db: Session, school_id: int, actor_id: int, data: VisitIn) -> ClinicVisit:
    student = get_school_student(db, data.student_id, school_id)
    at = data.visited_at or datetime.now(timezone.utc)
    if at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Visit time is in the future")
    v = ClinicVisit(
        tenant_id=student.tenant_id,
        school_id=school_id,
        student_id=student.id,
        visited_at=at,
        complaint=data.complaint.strip(),
        temperature_c=data.temperature_c,
        treatment=data.treatment,
        medicine_given=data.medicine_given,
        outcome=data.outcome,
        follow_up_on=data.follow_up_on,
        recorded_by_user_id=actor_id,
    )
    db.add(v)
    db.flush()
    # Anything beyond a quick check always goes to the parents.
    must_notify = data.outcome in (ClinicOutcome.sent_home, ClinicOutcome.referred_hospital, ClinicOutcome.parent_picked_up)
    if data.notify_parent or must_notify:
        lines = [f"{student.full_name} visited the school sick room: {v.complaint}."]
        if v.temperature_c:
            lines.append(f"Temperature: {v.temperature_c} °C.")
        if v.medicine_given:
            lines.append(f"Given: {v.medicine_given}.")
        lines.append(f"{student.full_name.split()[0]} {OUTCOME_TEXT[v.outcome]}.")
        if v.outcome == ClinicOutcome.referred_hospital:
            lines.append("Please contact the school office immediately.")
        v.parent_notified = notify.student_parents(db, student, f"Health update: {student.full_name}", "\n".join(lines)) > 0
    db.commit()
    db.refresh(v)
    return v


def visit_to_read(db: Session, v: ClinicVisit, labels: Optional[dict] = None) -> dict:
    s = db.get(Student, v.student_id)
    who = db.get(User, v.recorded_by_user_id) if v.recorded_by_user_id else None
    p = _profile(db, s) if s else None
    return {
        "id": v.id,
        "student_id": v.student_id,
        "student_name": s.full_name if s else "",
        "section_label": (labels or {}).get(s.section_id) if labels else (section_label(db, s.section_id) if s else None),
        "visited_at": v.visited_at,
        "complaint": v.complaint,
        "temperature_c": v.temperature_c,
        "treatment": v.treatment,
        "medicine_given": v.medicine_given,
        "outcome": v.outcome,
        "follow_up_on": v.follow_up_on,
        "parent_notified": v.parent_notified,
        "recorded_by_name": who.full_name if who else None,
        "allergies": p.allergies if p else None,
    }


def list_visits(db: Session, school_id: int, *, on: Optional[date] = None, student_id: Optional[int] = None,
                days: int = 30) -> list[dict]:
    stmt = select(ClinicVisit).where(ClinicVisit.school_id == school_id)
    if student_id:
        stmt = stmt.where(ClinicVisit.student_id == student_id)
    if on:
        start = datetime.combine(on, time.min, tzinfo=timezone.utc)
        stmt = stmt.where(ClinicVisit.visited_at >= start, ClinicVisit.visited_at < start + timedelta(days=1))
    elif not student_id:
        stmt = stmt.where(ClinicVisit.visited_at >= datetime.now(timezone.utc) - timedelta(days=days))
    visits = list(db.execute(stmt.order_by(ClinicVisit.visited_at.desc()).limit(500)).scalars())
    sids = {v.student_id for v in visits}
    sec = dict(db.execute(select(Student.id, Student.section_id).where(Student.id.in_(sids))).all()) if sids else {}
    labels = section_labels(db, set(sec.values()))
    return [visit_to_read(db, v, labels) for v in visits]


# --- Records ---

def health_record(db: Session, student: Student) -> dict:
    checkups = db.execute(
        select(HealthCheckup).where(HealthCheckup.student_id == student.id).order_by(HealthCheckup.checked_on.desc())
    ).scalars()
    visits = db.execute(
        select(ClinicVisit).where(ClinicVisit.student_id == student.id).order_by(ClinicVisit.visited_at.desc()).limit(50)
    ).scalars()
    imms = db.execute(
        select(Immunization).where(Immunization.student_id == student.id).order_by(Immunization.given_on.desc().nulls_first())
    ).scalars()
    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "section_label": section_label(db, student.section_id),
        "profile": profile_to_read(db, student, _profile(db, student)),
        "checkups": [checkup_to_read(c) for c in checkups],
        "visits": [visit_to_read(db, v) for v in visits],
        "immunizations": [ImmunizationRead.model_validate(i).model_dump() for i in imms],
    }


def list_profiles(db: Session, school_id: int, *, section_id: Optional[int] = None,
                  with_profile_only: bool = False, search: Optional[str] = None) -> list[dict]:
    """Every child and what the school knows about their health.

    The alerts list only shows children staff must be warned about; this shows
    the whole roster, including the ones with nothing recorded yet, so the
    office can see the gaps rather than assume silence means healthy.
    """
    stmt = (
        select(Student, MedicalProfile)
        .join(MedicalProfile, MedicalProfile.student_id == Student.id, isouter=True)
        .where(Student.school_id == school_id, Student.is_active.is_(True))
        .order_by(Student.full_name)
    )
    if section_id:
        stmt = stmt.where(Student.section_id == section_id)
    if with_profile_only:
        stmt = stmt.where(MedicalProfile.id.is_not(None))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Student.full_name.ilike(like), Student.admission_no.ilike(like)))
    rows = db.execute(stmt).all()
    labels = section_labels(db, {s.section_id for s, _ in rows})
    out = []
    for student, profile in rows:
        flags = [
            label for label, value in (
                ("allergies", getattr(profile, "allergies", None)),
                ("conditions", getattr(profile, "chronic_conditions", None)),
                ("medication", getattr(profile, "current_medications", None)),
                ("dietary", getattr(profile, "dietary_restrictions", None)),
                ("disabilities", getattr(profile, "disabilities", None)),
            ) if (value or "").strip()
        ]
        out.append({
            "student_id": student.id,
            "admission_no": student.admission_no,
            "student_name": student.full_name,
            "section_label": labels.get(student.section_id),
            "blood_group": student.blood_group,
            "has_profile": profile is not None,
            "flags": flags,
            "allergies": getattr(profile, "allergies", None),
            "chronic_conditions": getattr(profile, "chronic_conditions", None),
            "current_medications": getattr(profile, "current_medications", None),
            "emergency_contact_name": getattr(profile, "emergency_contact_name", None),
            "emergency_contact_phone": getattr(profile, "emergency_contact_phone", None),
            "doctor_name": getattr(profile, "doctor_name", None),
            "updated_at": getattr(profile, "updated_at", None),
        })
    return out


def alerts(db: Session, school_id: int, *, section_id: Optional[int] = None) -> list[dict]:
    """Students whose allergies / conditions / medication staff should know about."""
    stmt = (
        select(Student, MedicalProfile)
        .join(MedicalProfile, MedicalProfile.student_id == Student.id)
        .where(
            Student.school_id == school_id,
            Student.is_active.is_(True),
            or_(
                func.coalesce(MedicalProfile.allergies, "") != "",
                func.coalesce(MedicalProfile.chronic_conditions, "") != "",
                func.coalesce(MedicalProfile.current_medications, "") != "",
            ),
        )
        .order_by(Student.full_name)
    )
    if section_id:
        stmt = stmt.where(Student.section_id == section_id)
    rows = db.execute(stmt).all()
    labels = section_labels(db, {s.section_id for s, _ in rows})
    return [
        {
            "student_id": s.id,
            "student_name": s.full_name,
            "section_label": labels.get(s.section_id),
            "blood_group": s.blood_group,
            "allergies": p.allergies,
            "chronic_conditions": p.chronic_conditions,
            "current_medications": p.current_medications,
            "emergency_contact_phone": p.emergency_contact_phone,
        }
        for s, p in rows
    ]


def immunizations_due(db: Session, school_id: int, within_days: int = 30) -> list[tuple[Immunization, Student]]:
    return list(
        db.execute(
            select(Immunization, Student)
            .join(Student, Immunization.student_id == Student.id)
            .where(
                Immunization.school_id == school_id,
                Student.is_active.is_(True),
                Immunization.next_due_on.is_not(None),
                Immunization.next_due_on <= date.today() + timedelta(days=within_days),
            )
            .order_by(Immunization.next_due_on)
        ).all()
    )


def dashboard(db: Session, school_id: int) -> dict:
    start = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)
    today = select(ClinicVisit).where(ClinicVisit.school_id == school_id, ClinicVisit.visited_at >= start)
    visits = list(db.execute(today).scalars())
    return {
        "visits_today": len(visits),
        "sent_home_today": sum(v.outcome in (ClinicOutcome.sent_home, ClinicOutcome.parent_picked_up) for v in visits),
        "referred_today": sum(v.outcome == ClinicOutcome.referred_hospital for v in visits),
        "students_with_alerts": len(alerts(db, school_id)),
        "immunizations_due": len(immunizations_due(db, school_id)),
        "follow_ups_due": db.execute(
            select(func.count(ClinicVisit.id)).where(
                ClinicVisit.school_id == school_id,
                ClinicVisit.follow_up_on.is_not(None),
                ClinicVisit.follow_up_on <= date.today(),
                ClinicVisit.follow_up_on >= date.today() - timedelta(days=7),
            )
        ).scalar_one(),
    }


# --- Parent ---

def parent_student(db: Session, parent_user_id: int, student_id: int) -> Student:
    return require_linked_child(db, parent_user_id, student_id)
