"""Doses, first aid, the counselling diary, escalation chains, and marking a
sanction served.

Three rules are enforced here rather than in a route or a screen, because
each of them is the reason the corresponding record is worth keeping.

A medication row is never edited or deleted; a mistake is a second row
pointing at the first. A counsellor's private notes are not selected by the
list query at all, so no caller can leak them by forgetting a filter. An
escalation chain is renumbered on removal, so nobody stops at a gap.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import AppointmentStatus, FirstAidOutcome, UserRole
from app.core.scoping import get_school_student, section_label
from app.models.academic import Section
from app.models.health import Immunization, MedicalProfile
from app.models.pastoral import DisciplineAction, DisciplineIncident
from app.models.student import Student
from app.models.user import User
from app.models.wellbeing import (
    CounsellingAppointment,
    EmergencyEscalation,
    FirstAidLog,
    MedicationAdministration,
)


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _403(why: str) -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, why)


def _name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.full_name if u else None


def _child(db: Session, student_id: int, school_id: int) -> Student:
    return get_school_student(db, student_id, school_id)


def _student_label(db: Session, s: Student) -> dict:
    return {
        "student_id": s.id,
        "student_name": s.full_name,
        "admission_no": s.admission_no,
        "section_label": section_label(db, s.section_id),
    }


# ---------- medication: append only ----------


def medication_to_dict(db: Session, row: MedicationAdministration) -> dict:
    s = db.get(Student, row.student_id)
    return {
        "id": row.id,
        **(_student_label(db, s) if s else {"student_id": row.student_id}),
        "given_on": row.given_on,
        "given_at": row.given_at,
        "medicine": row.medicine,
        "dose": row.dose,
        "reason": row.reason,
        "given_by": _name(db, row.given_by_user_id),
        "given_by_user_id": row.given_by_user_id,
        "recorded_by": _name(db, row.recorded_by_user_id) if row.recorded_by_user_id else None,
        "prescribed_by": row.prescribed_by,
        "consent_reference": row.consent_reference,
        "parent_informed": row.parent_informed,
        "notes": row.notes,
        "corrects_id": row.corrects_id,
        "correction_reason": row.correction_reason,
        "superseded_at": row.superseded_at,
        "is_superseded": row.superseded_at is not None,
        "recorded_at": row.created_at,
    }


def give_medication(db: Session, school_id: int, tenant_id: int, user_id: int,
                    student_id: int, *, given_on: date, given_at: time,
                    medicine: str, dose: str, reason: Optional[str] = None,
                    parent_informed: bool = False,
                    notes: Optional[str] = None, prescribed_by: Optional[str] = None,
                    consent_reference: Optional[str] = None,
                    given_by_user_id: Optional[int] = None) -> dict:
    _child(db, student_id, school_id)
    if given_by_user_id and given_by_user_id != user_id:
        giver = db.get(User, given_by_user_id)
        if not giver or giver.school_id != school_id:
            raise _400("That member of staff is not at this school.")
    if not medicine.strip() or not dose.strip():
        raise _400("A dose record needs the medicine and the amount given.")
    if given_on > date.today():
        raise _400("A dose cannot be recorded before it has been given.")

    row = MedicationAdministration(
        tenant_id=tenant_id, school_id=school_id, student_id=student_id,
        given_on=given_on, given_at=given_at, medicine=medicine.strip(),
        dose=dose.strip(), reason=reason, given_by_user_id=given_by_user_id or user_id,
        recorded_by_user_id=user_id, parent_informed=parent_informed, notes=notes,
        prescribed_by=(prescribed_by or "").strip() or None,
        consent_reference=(consent_reference or "").strip() or None,
    )
    db.add(row)
    db.commit()
    return medication_to_dict(db, row)


def correct_medication(db: Session, school_id: int, tenant_id: int, user_id: int,
                       original_id: int, *, medicine: str, dose: str,
                       given_on: date, given_at: time, correction_reason: str,
                       reason: Optional[str] = None,
                       notes: Optional[str] = None) -> dict:
    """Correct a dose record by writing a new one and retiring the old.

    Deliberately not an update. The register's value is that it shows what was
    written at the time as well as what the school later decided was true —
    an edit in place destroys the first of those, which is the half a parent
    or an inspector actually asks about.
    """
    original = db.get(MedicationAdministration, original_id)
    if not original or original.school_id != school_id:
        raise _404("Medication record")
    if original.superseded_at is not None:
        raise _400("That record has already been corrected. Correct the newer one.")
    if not correction_reason or len(correction_reason.strip()) < 3:
        raise _400("Say what was wrong with the original record.")

    replacement = MedicationAdministration(
        tenant_id=tenant_id, school_id=school_id, student_id=original.student_id,
        given_on=given_on, given_at=given_at, medicine=medicine.strip(),
        dose=dose.strip(), reason=reason, given_by_user_id=user_id,
        parent_informed=original.parent_informed, notes=notes,
        prescribed_by=original.prescribed_by, consent_reference=original.consent_reference,
        recorded_by_user_id=user_id,
        corrects_id=original.id, correction_reason=correction_reason.strip(),
    )
    db.add(replacement)
    original.superseded_at = datetime.now(timezone.utc)
    db.commit()
    return medication_to_dict(db, replacement)


def list_medication(db: Session, school_id: int, *, frm: Optional[date] = None,
                    to: Optional[date] = None, student_id: Optional[int] = None,
                    include_superseded: bool = True) -> list[dict]:
    to = to or date.today()
    frm = frm or (to - timedelta(days=30))
    stmt = select(MedicationAdministration).where(
        MedicationAdministration.school_id == school_id,
        MedicationAdministration.given_on >= frm,
        MedicationAdministration.given_on <= to,
    )
    if student_id:
        stmt = stmt.where(MedicationAdministration.student_id == student_id)
    if not include_superseded:
        stmt = stmt.where(MedicationAdministration.superseded_at.is_(None))
    rows = db.execute(
        stmt.order_by(MedicationAdministration.given_on.desc(),
                      MedicationAdministration.given_at.desc())
    ).scalars()
    return [medication_to_dict(db, r) for r in rows]


# ---------- first aid ----------


def first_aid_to_dict(db: Session, row: FirstAidLog) -> dict:
    who: dict = {}
    if row.student_id:
        s = db.get(Student, row.student_id)
        if s:
            who = _student_label(db, s)
    return {
        "id": row.id,
        "student_id": row.student_id,
        "student_name": who.get("student_name"),
        "admission_no": who.get("admission_no"),
        "section_label": who.get("section_label"),
        "staff_user_id": row.staff_user_id,
        "staff_name": _name(db, row.staff_user_id),
        "happened_on": row.happened_on,
        "happened_at": row.happened_at,
        "place": row.place,
        "what_happened": row.what_happened,
        "treatment": row.treatment,
        "treated_by": _name(db, row.treated_by_user_id),
        "outcome": row.outcome.value,
        "sent_home": row.sent_home,
        "parent_informed": row.parent_informed,
        "referred_to": row.referred_to,
    }


def log_first_aid(db: Session, school_id: int, tenant_id: int, user_id: int, *,
                  happened_on: date, happened_at: time, what_happened: str,
                  treatment: str, student_id: Optional[int] = None,
                  staff_user_id: Optional[int] = None, place: Optional[str] = None,
                  outcome: FirstAidOutcome = FirstAidOutcome.returned_to_class,
                  sent_home: bool = False, parent_informed: bool = False,
                  referred_to: Optional[str] = None) -> dict:
    if not student_id and not staff_user_id:
        raise _400("Say who was hurt — a child or a member of staff.")
    if student_id:
        _child(db, student_id, school_id)
    if not what_happened.strip() or not treatment.strip():
        raise _400("Record what happened and what was done about it.")

    row = FirstAidLog(
        tenant_id=tenant_id, school_id=school_id, student_id=student_id,
        staff_user_id=staff_user_id, happened_on=happened_on,
        happened_at=happened_at, place=place,
        what_happened=what_happened.strip(), treatment=treatment.strip(),
        treated_by_user_id=user_id, outcome=outcome, sent_home=sent_home,
        parent_informed=parent_informed, referred_to=referred_to,
    )
    db.add(row)
    db.commit()
    return first_aid_to_dict(db, row)


def list_first_aid(db: Session, school_id: int, *, frm: Optional[date] = None,
                   to: Optional[date] = None) -> list[dict]:
    to = to or date.today()
    frm = frm or (to - timedelta(days=30))
    rows = db.execute(
        select(FirstAidLog)
        .where(
            FirstAidLog.school_id == school_id,
            FirstAidLog.happened_on >= frm,
            FirstAidLog.happened_on <= to,
        )
        .order_by(FirstAidLog.happened_on.desc(), FirstAidLog.happened_at.desc())
    ).scalars()
    return [first_aid_to_dict(db, r) for r in rows]


# ---------- counselling diary ----------

# The columns anybody may read. private_notes is absent on purpose: the list
# query selects these by name, so a caller cannot leak the notebook by
# forgetting a filter somewhere downstream.
APPOINTMENT_PUBLIC = (
    CounsellingAppointment.id,
    CounsellingAppointment.case_id,
    CounsellingAppointment.student_id,
    CounsellingAppointment.scheduled_on,
    CounsellingAppointment.scheduled_at,
    CounsellingAppointment.duration_minutes,
    CounsellingAppointment.counsellor_user_id,
    CounsellingAppointment.status,
    CounsellingAppointment.notes,
)


def _may_counsel(db: Session, user: User) -> bool:
    from app.services import rbac_service

    return rbac_service.has_permission(db, user, "counselling.access")


def list_appointments(db: Session, school_id: int, *, frm: Optional[date] = None,
                      to: Optional[date] = None,
                      counsellor_user_id: Optional[int] = None,
                      student_id: Optional[int] = None) -> list[dict]:
    """The diary. Never carries private notes — see APPOINTMENT_PUBLIC."""
    frm = frm or date.today()
    to = to or (frm + timedelta(days=14))
    stmt = select(*APPOINTMENT_PUBLIC).where(
        CounsellingAppointment.school_id == school_id,
        CounsellingAppointment.scheduled_on >= frm,
        CounsellingAppointment.scheduled_on <= to,
    )
    if counsellor_user_id:
        stmt = stmt.where(CounsellingAppointment.counsellor_user_id == counsellor_user_id)
    if student_id:
        stmt = stmt.where(CounsellingAppointment.student_id == student_id)

    rows = db.execute(
        stmt.order_by(CounsellingAppointment.scheduled_on,
                      CounsellingAppointment.scheduled_at)
    ).all()

    out = []
    for r in rows:
        s = db.get(Student, r.student_id)
        out.append({
            "id": r.id,
            "case_id": r.case_id,
            **(_student_label(db, s) if s else {"student_id": r.student_id}),
            "scheduled_on": r.scheduled_on,
            "scheduled_at": r.scheduled_at,
            "duration_minutes": r.duration_minutes,
            "counsellor_user_id": r.counsellor_user_id,
            "counsellor_name": _name(db, r.counsellor_user_id),
            "status": r.status.value,
            "notes": r.notes,
        })
    return out


def book_appointment(db: Session, school_id: int, tenant_id: int, user_id: int,
                     student_id: int, *, scheduled_on: date, scheduled_at: time,
                     duration_minutes: int = 30,
                     counsellor_user_id: Optional[int] = None,
                     case_id: Optional[int] = None,
                     notes: Optional[str] = None) -> dict:
    _child(db, student_id, school_id)
    counsellor = counsellor_user_id or user_id

    # Two children in the same chair at the same time is a booking error, not
    # a judgement call, so it is refused rather than warned about.
    clash = db.execute(
        select(CounsellingAppointment).where(
            CounsellingAppointment.school_id == school_id,
            CounsellingAppointment.counsellor_user_id == counsellor,
            CounsellingAppointment.scheduled_on == scheduled_on,
            CounsellingAppointment.scheduled_at == scheduled_at,
            CounsellingAppointment.status.in_(
                [AppointmentStatus.booked, AppointmentStatus.attended]
            ),
        )
    ).scalar_one_or_none()
    if clash:
        raise _400(
            f"{_name(db, counsellor) or 'That counsellor'} already has somebody "
            f"booked at {scheduled_at:%H:%M} that day."
        )

    row = CounsellingAppointment(
        tenant_id=tenant_id, school_id=school_id, case_id=case_id,
        student_id=student_id, scheduled_on=scheduled_on,
        scheduled_at=scheduled_at, duration_minutes=duration_minutes,
        counsellor_user_id=counsellor, status=AppointmentStatus.booked,
        notes=notes,
    )
    db.add(row)
    db.commit()
    return list_appointments(
        db, school_id, frm=scheduled_on, to=scheduled_on, student_id=student_id
    )[-1]


def set_appointment_status(db: Session, school_id: int, user: User,
                           appointment_id: int, new_status: AppointmentStatus,
                           *, notes: Optional[str] = None,
                           private_notes: Optional[str] = None) -> dict:
    row = db.get(CounsellingAppointment, appointment_id)
    if not row or row.school_id != school_id:
        raise _404("Appointment")

    # Only the counsellor who held the session may write the private note.
    if private_notes is not None and row.counsellor_user_id != user.id:
        raise _403("Only the counsellor who held the session can write that note.")

    row.status = new_status
    if notes is not None:
        row.notes = notes
    if private_notes is not None:
        row.private_notes = private_notes
    db.commit()
    return list_appointments(
        db, school_id, frm=row.scheduled_on, to=row.scheduled_on,
        student_id=row.student_id
    )[0]


def private_note(db: Session, school_id: int, user: User, appointment_id: int) -> dict:
    """The counsellor's own note, on its own path, for its owner only.

    Not an admin override. A head who needs to know something a counsellor
    wrote should ask the counsellor; a system that lets them read it quietly
    changes what gets written down, which costs more than it gains.
    """
    row = db.get(CounsellingAppointment, appointment_id)
    if not row or row.school_id != school_id:
        raise _404("Appointment")
    if row.counsellor_user_id != user.id:
        raise _403("These notes belong to the counsellor who wrote them.")
    return {"id": row.id, "private_notes": row.private_notes}


def counsellor_load(db: Session, school_id: int, *, frm: date, to: date) -> list[dict]:
    """How many appointments each counsellor has, and how many were missed."""
    rows = db.execute(
        select(
            CounsellingAppointment.counsellor_user_id,
            CounsellingAppointment.status,
            func.count(CounsellingAppointment.id),
        )
        .where(
            CounsellingAppointment.school_id == school_id,
            CounsellingAppointment.scheduled_on >= frm,
            CounsellingAppointment.scheduled_on <= to,
        )
        .group_by(CounsellingAppointment.counsellor_user_id,
                  CounsellingAppointment.status)
    ).all()

    per: dict[Optional[int], dict] = {}
    for uid, st, n in rows:
        bucket = per.setdefault(uid, {
            "counsellor_user_id": uid,
            "counsellor_name": _name(db, uid) or "Unassigned",
            "booked": 0, "attended": 0, "missed": 0, "cancelled": 0, "total": 0,
        })
        bucket[st.value] = bucket.get(st.value, 0) + n
        bucket["total"] += n
    return sorted(per.values(), key=lambda b: -b["total"])


# ---------- emergency escalation ----------


def escalation_to_dict(row: EmergencyEscalation) -> dict:
    return {
        "id": row.id,
        "student_id": row.student_id,
        "sequence": row.sequence,
        "contact_name": row.contact_name,
        "relationship": row.relationship,
        "phone": row.phone,
        "notes": row.notes,
        "availability": row.availability,
    }


def escalation_chain(db: Session, school_id: int, student_id: int) -> dict:
    """The chain, plus the medical profile's own contact so the two are seen
    together rather than in different screens saying different numbers."""
    s = _child(db, student_id, school_id)
    rows = db.execute(
        select(EmergencyEscalation)
        .where(EmergencyEscalation.student_id == student_id)
        .order_by(EmergencyEscalation.sequence)
    ).scalars()
    profile = db.execute(
        select(MedicalProfile).where(MedicalProfile.student_id == student_id)
    ).scalar_one_or_none()
    return {
        **_student_label(db, s),
        "chain": [escalation_to_dict(r) for r in rows],
        "profile_contact_name": profile.emergency_contact_name if profile else None,
        "profile_contact_phone": profile.emergency_contact_phone if profile else None,
        "profile_contact_relation": profile.emergency_contact_relation if profile else None,
        "doctor_name": profile.doctor_name if profile else None,
        "doctor_phone": profile.doctor_phone if profile else None,
    }


def add_escalation(db: Session, school_id: int, tenant_id: int, student_id: int, *,
                   contact_name: str, relationship: str, phone: str,
                   notes: Optional[str] = None, availability: Optional[str] = None) -> dict:
    _child(db, student_id, school_id)
    if not contact_name.strip() or not phone.strip():
        raise _400("A contact needs a name and a number.")
    highest = db.execute(
        select(func.coalesce(func.max(EmergencyEscalation.sequence), 0))
        .where(EmergencyEscalation.student_id == student_id)
    ).scalar_one()
    row = EmergencyEscalation(
        tenant_id=tenant_id, school_id=school_id, student_id=student_id,
        sequence=highest + 1, contact_name=contact_name.strip(),
        relationship=relationship.strip(), phone=phone.strip(), notes=notes,
        availability=(availability or "").strip() or None,
    )
    db.add(row)
    db.commit()
    return escalation_chain(db, school_id, student_id)


def remove_escalation(db: Session, school_id: int, escalation_id: int) -> dict:
    """Remove a link and close the gap.

    Renumbering matters: a chain reading 1, 3, 4 invites whoever is holding
    the phone to assume 2 is missing for a reason and stop there.
    """
    row = db.get(EmergencyEscalation, escalation_id)
    if not row or row.school_id != school_id:
        raise _404("Contact")
    student_id = row.student_id
    db.delete(row)
    db.flush()

    remaining = list(db.execute(
        select(EmergencyEscalation)
        .where(EmergencyEscalation.student_id == student_id)
        .order_by(EmergencyEscalation.sequence)
    ).scalars())
    # Shift out of the way first: the unique (student, sequence) index would
    # otherwise trip while two rows briefly share a number.
    for offset, r in enumerate(remaining, start=1):
        r.sequence = 1000 + offset
    db.flush()
    for n, r in enumerate(remaining, start=1):
        r.sequence = n
    db.commit()
    return escalation_chain(db, school_id, student_id)


def reorder_escalation(db: Session, school_id: int, student_id: int,
                       ordered_ids: list[int]) -> dict:
    _child(db, student_id, school_id)
    rows = {
        r.id: r for r in db.execute(
            select(EmergencyEscalation)
            .where(EmergencyEscalation.student_id == student_id)
        ).scalars()
    }
    if set(ordered_ids) != set(rows):
        raise _400("That list does not match this child's contacts.")
    for offset, cid in enumerate(ordered_ids, start=1):
        rows[cid].sequence = 1000 + offset
    db.flush()
    for n, cid in enumerate(ordered_ids, start=1):
        rows[cid].sequence = n
    db.commit()
    return escalation_chain(db, school_id, student_id)


def missing_chains(db: Session, school_id: int) -> dict:
    """Children with nobody to ring beyond the one profile contact.

    The point of the screen: a chain of one is what a school discovers at the
    worst possible moment.
    """
    students = list(db.execute(
        select(Student).where(Student.school_id == school_id, Student.is_active.is_(True))
    ).scalars())
    counts: dict[int, int] = {}
    reachable: dict[int, list[str]] = {}
    for sid, avail in db.execute(
        select(EmergencyEscalation.student_id, EmergencyEscalation.availability)
        .where(EmergencyEscalation.school_id == school_id)
        .order_by(EmergencyEscalation.student_id, EmergencyEscalation.sequence)
    ).all():
        counts[sid] = counts.get(sid, 0) + 1
        if avail:
            reachable.setdefault(sid, []).append(avail)
    profiles = {
        p.student_id: p for p in db.execute(
            select(MedicalProfile).where(MedicalProfile.school_id == school_id)
        ).scalars()
    }

    thin = []
    for s in students:
        chain = counts.get(s.id, 0)
        profile = profiles.get(s.id)
        has_profile_contact = bool(profile and profile.emergency_contact_phone)
        if chain == 0 and not has_profile_contact:
            why = "no contact at all"
        elif chain + (1 if has_profile_contact else 0) < 2:
            why = "only one number"
        else:
            continue
        thin.append({**_student_label(db, s), "contacts": chain, "why": why,
                     "availability": "; ".join(reachable.get(s.id, [])) or None})

    return {
        "students": sorted(thin, key=lambda r: r["student_name"]),
        "count": len(thin),
        "none_at_all": sum(1 for r in thin if r["why"] == "no contact at all"),
    }


# ---------- immunisation, a room at a time ----------


def bulk_immunise(db: Session, school_id: int, tenant_id: int, user_id: int, *,
                  section_id: int, vaccine: str, given_on: date,
                  dose: Optional[str] = None, next_due_on: Optional[date] = None,
                  skip_student_ids: Optional[list[int]] = None) -> dict:
    """Record a vaccination drive.

    A drive is a room of thirty children, not thirty visits to a form. The
    absentees are passed in and skipped rather than recorded and corrected
    later, because a vaccination somebody did not have is the one mistake in
    this module that could actually hurt a child.
    """
    section = db.get(Section, section_id)
    if not section or section.school_id != school_id:
        raise _404("Section")
    if not vaccine.strip():
        raise _400("Say which vaccine was given.")

    skip = set(skip_student_ids or [])
    children = list(db.execute(
        select(Student)
        .where(Student.section_id == section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.id)
    ).scalars())

    recorded, skipped, already = [], [], []
    for s in children:
        if s.id in skip:
            skipped.append(_student_label(db, s))
            continue
        clash = db.execute(
            select(Immunization).where(
                Immunization.student_id == s.id,
                Immunization.vaccine == vaccine.strip(),
                Immunization.given_on == given_on,
            )
        ).scalar_one_or_none()
        if clash:
            already.append(_student_label(db, s))
            continue
        db.add(Immunization(
            tenant_id=tenant_id, school_id=school_id, student_id=s.id,
            vaccine=vaccine.strip(), dose=dose, given_on=given_on,
            next_due_on=next_due_on, recorded_by_user_id=user_id,
        ))
        recorded.append(_student_label(db, s))
    db.commit()
    return {
        "section_id": section_id,
        "vaccine": vaccine.strip(),
        "given_on": given_on,
        "recorded": recorded,
        "skipped": skipped,
        "already_had_it": already,
        "in_section": len(children),
    }


# ---------- marking a sanction served ----------


def action_to_dict(db: Session, row: DisciplineAction,
                   incident: Optional[DisciplineIncident] = None) -> dict:
    incident = incident or db.get(DisciplineIncident, row.incident_id)
    s = db.get(Student, incident.student_id) if incident else None
    today = date.today()
    overdue = bool(
        row.completed_on is None and row.end_date is not None and row.end_date < today
    )
    return {
        "id": row.id,
        "incident_id": row.incident_id,
        "reference_no": incident.reference_no if incident else None,
        **(_student_label(db, s) if s else {}),
        "kind": row.kind.value,
        "details": row.details,
        "start_date": row.start_date,
        "end_date": row.end_date,
        "assigned_by": _name(db, row.assigned_by_user_id),
        "completed_on": row.completed_on,
        "completed_by": _name(db, row.completed_by_user_id),
        "is_served": row.completed_on is not None,
        "overdue": overdue,
    }


def list_actions(db: Session, school_id: int, *, outstanding_only: bool = False,
                 frm: Optional[date] = None, to: Optional[date] = None) -> dict:
    stmt = select(DisciplineAction).where(DisciplineAction.school_id == school_id)
    if outstanding_only:
        stmt = stmt.where(DisciplineAction.completed_on.is_(None))
    if frm:
        stmt = stmt.where(
            (DisciplineAction.start_date >= frm) | (DisciplineAction.start_date.is_(None))
        )
    if to:
        stmt = stmt.where(
            (DisciplineAction.start_date <= to) | (DisciplineAction.start_date.is_(None))
        )
    rows = db.execute(
        stmt.order_by(DisciplineAction.completed_on.is_(None).desc(),
                      DisciplineAction.end_date.nulls_last(),
                      DisciplineAction.id.desc())
    ).scalars()
    out = [action_to_dict(db, r) for r in rows]
    return {
        "actions": out,
        "outstanding": sum(1 for a in out if not a["is_served"]),
        "overdue": sum(1 for a in out if a["overdue"]),
    }


def mark_served(db: Session, school_id: int, user_id: int, action_id: int, *,
                served_on: Optional[date] = None) -> dict:
    row = db.get(DisciplineAction, action_id)
    if not row or row.school_id != school_id:
        raise _404("Action")
    if row.completed_on is not None:
        raise _400("That has already been marked served.")
    when = served_on or date.today()
    if when > date.today():
        raise _400("A sanction cannot be served in the future.")
    row.completed_on = when
    row.completed_by_user_id = user_id
    db.commit()
    return action_to_dict(db, row)


def unmark_served(db: Session, school_id: int, action_id: int) -> dict:
    """Undo a mistaken sign-off. Kept because the alternative is a second,
    duplicate sanction invented to cancel the first."""
    row = db.get(DisciplineAction, action_id)
    if not row or row.school_id != school_id:
        raise _404("Action")
    row.completed_on = None
    row.completed_by_user_id = None
    db.commit()
    return action_to_dict(db, row)
