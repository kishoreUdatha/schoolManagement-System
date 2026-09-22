"""Medication and first aid, the counselling diary, escalation chains, and
marking a sanction served.

Who may reach what follows what the record is for. A dose register is clinic
work, so the office and anyone given health.manage can write it. The
counselling diary needs counselling.access, the same permission the existing
case routes use — and a counsellor's private note has no route that anybody
else can call, by design rather than by filter.
"""
from __future__ import annotations

from datetime import date, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import AppointmentStatus, FirstAidOutcome, UserRole
from app.database import get_db
from app.models.user import User
from app.services import rbac_service, wellbeing_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]

OFFICE = (UserRole.school_admin, UserRole.principal)


def _health_staff(current_user: CurrentUser, db: Db) -> User:
    if current_user.school_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "School access required")
    if current_user.role in OFFICE or rbac_service.has_permission(
        db, current_user, "health.manage"
    ):
        return current_user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Health access required")


def _counselling_staff(current_user: CurrentUser, db: Db) -> User:
    if current_user.school_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "School access required")
    if current_user.role in OFFICE or rbac_service.has_permission(
        db, current_user, "counselling.access"
    ):
        return current_user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Counselling access required")


def _discipline_staff(current_user: CurrentUser, db: Db) -> User:
    if current_user.school_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "School access required")
    if current_user.role in OFFICE or rbac_service.has_permission(
        db, current_user, "discipline.manage"
    ):
        return current_user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Discipline access required")


Health = Annotated[User, Depends(_health_staff)]
Counsel = Annotated[User, Depends(_counselling_staff)]
Discipline = Annotated[User, Depends(_discipline_staff)]


# ---------- payloads ----------


class DoseIn(BaseModel):
    student_id: int
    given_on: date
    given_at: time
    medicine: str = Field(..., min_length=1, max_length=200)
    dose: str = Field(..., min_length=1, max_length=120)
    reason: Optional[str] = Field(None, max_length=300)
    parent_informed: bool = False
    notes: Optional[str] = Field(None, max_length=4000)
    prescribed_by: Optional[str] = Field(None, max_length=160)
    consent_reference: Optional[str] = Field(None, max_length=120)
    # the member of staff who gave the dose; left out = whoever is signed in
    given_by_user_id: Optional[int] = None


class DoseCorrectionIn(BaseModel):
    given_on: date
    given_at: time
    medicine: str = Field(..., min_length=1, max_length=200)
    dose: str = Field(..., min_length=1, max_length=120)
    correction_reason: str = Field(..., min_length=3, max_length=300)
    reason: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=4000)


class FirstAidIn(BaseModel):
    student_id: Optional[int] = None
    staff_user_id: Optional[int] = None
    happened_on: date
    happened_at: time
    place: Optional[str] = Field(None, max_length=160)
    what_happened: str = Field(..., min_length=1, max_length=4000)
    treatment: str = Field(..., min_length=1, max_length=4000)
    outcome: FirstAidOutcome = FirstAidOutcome.returned_to_class
    sent_home: bool = False
    parent_informed: bool = False
    referred_to: Optional[str] = Field(None, max_length=200)


class AppointmentIn(BaseModel):
    student_id: int
    scheduled_on: date
    scheduled_at: time
    duration_minutes: int = Field(30, ge=5, le=240)
    counsellor_user_id: Optional[int] = None
    case_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=4000)


class AppointmentStatusIn(BaseModel):
    status: AppointmentStatus
    notes: Optional[str] = Field(None, max_length=4000)
    private_notes: Optional[str] = Field(None, max_length=8000)


class EscalationIn(BaseModel):
    contact_name: str = Field(..., min_length=1, max_length=160)
    relationship: str = Field(..., min_length=1, max_length=60)
    phone: str = Field(..., min_length=4, max_length=20)
    notes: Optional[str] = Field(None, max_length=300)
    availability: Optional[str] = Field(None, max_length=120)


class ReorderIn(BaseModel):
    ordered_ids: list[int]


class BulkImmuniseIn(BaseModel):
    section_id: int
    vaccine: str = Field(..., min_length=1, max_length=120)
    given_on: date
    dose: Optional[str] = Field(None, max_length=40)
    next_due_on: Optional[date] = None
    skip_student_ids: list[int] = Field(default_factory=list)


class ServedIn(BaseModel):
    served_on: Optional[date] = None


# ---------- medication: written once, corrected by writing again ----------


@router.get("/medication", summary="The dose register")
def list_medication(current_user: Health, db: Db,
                    frm: Optional[date] = Query(None, alias="from"),
                    to: Optional[date] = None,
                    student_id: Optional[int] = None,
                    include_superseded: bool = True):
    return svc.list_medication(
        db, current_user.school_id, frm=frm, to=to, student_id=student_id,
        include_superseded=include_superseded,
    )


@router.post("/medication", status_code=status.HTTP_201_CREATED,
             summary="Record a dose actually given")
def give_medication(payload: DoseIn, current_user: Health, db: Db):
    return svc.give_medication(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        payload.student_id, given_on=payload.given_on, given_at=payload.given_at,
        medicine=payload.medicine, dose=payload.dose, reason=payload.reason,
        parent_informed=payload.parent_informed, notes=payload.notes,
        prescribed_by=payload.prescribed_by, consent_reference=payload.consent_reference,
        given_by_user_id=payload.given_by_user_id,
    )


# There is deliberately no PATCH and no DELETE on a dose record. A mistake is
# corrected by writing a second row that points back at the first, so the
# register still shows what was written at the time.
@router.post("/medication/{record_id}/correct", status_code=status.HTTP_201_CREATED,
             summary="Correct a dose record by superseding it")
def correct_medication(record_id: int, payload: DoseCorrectionIn,
                       current_user: Health, db: Db):
    return svc.correct_medication(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        record_id, medicine=payload.medicine, dose=payload.dose,
        given_on=payload.given_on, given_at=payload.given_at,
        correction_reason=payload.correction_reason, reason=payload.reason,
        notes=payload.notes,
    )


# ---------- first aid ----------


@router.get("/first-aid", summary="The first-aid log")
def list_first_aid(current_user: Health, db: Db,
                   frm: Optional[date] = Query(None, alias="from"),
                   to: Optional[date] = None):
    return svc.list_first_aid(db, current_user.school_id, frm=frm, to=to)


@router.post("/first-aid", status_code=status.HTTP_201_CREATED,
             summary="Log a cut, a bump or a faint — child or staff")
def log_first_aid(payload: FirstAidIn, current_user: Health, db: Db):
    return svc.log_first_aid(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        happened_on=payload.happened_on, happened_at=payload.happened_at,
        what_happened=payload.what_happened, treatment=payload.treatment,
        student_id=payload.student_id, staff_user_id=payload.staff_user_id,
        place=payload.place, outcome=payload.outcome, sent_home=payload.sent_home,
        parent_informed=payload.parent_informed, referred_to=payload.referred_to,
    )


# ---------- counselling diary ----------


@router.get("/counselling/appointments", summary="The diary — never carries private notes")
def list_appointments(current_user: Counsel, db: Db,
                      frm: Optional[date] = Query(None, alias="from"),
                      to: Optional[date] = None,
                      counsellor_user_id: Optional[int] = None,
                      student_id: Optional[int] = None):
    return svc.list_appointments(
        db, current_user.school_id, frm=frm, to=to,
        counsellor_user_id=counsellor_user_id, student_id=student_id,
    )


@router.post("/counselling/appointments", status_code=status.HTTP_201_CREATED,
             summary="Book a session")
def book_appointment(payload: AppointmentIn, current_user: Counsel, db: Db):
    return svc.book_appointment(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        payload.student_id, scheduled_on=payload.scheduled_on,
        scheduled_at=payload.scheduled_at, duration_minutes=payload.duration_minutes,
        counsellor_user_id=payload.counsellor_user_id, case_id=payload.case_id,
        notes=payload.notes,
    )


@router.patch("/counselling/appointments/{appointment_id}",
              summary="Mark attended, missed or cancelled")
def set_status(appointment_id: int, payload: AppointmentStatusIn,
               current_user: Counsel, db: Db):
    return svc.set_appointment_status(
        db, current_user.school_id, current_user, appointment_id, payload.status,
        notes=payload.notes, private_notes=payload.private_notes,
    )


@router.get("/counselling/appointments/{appointment_id}/private-note",
            summary="The counsellor's own note — only for the counsellor who wrote it")
def private_note(appointment_id: int, current_user: Counsel, db: Db):
    return svc.private_note(db, current_user.school_id, current_user, appointment_id)


@router.get("/counselling/load", summary="Appointments and misses per counsellor")
def counsellor_load(current_user: Counsel, db: Db,
                    frm: date = Query(..., alias="from"), to: date = Query(...)):
    return svc.counsellor_load(db, current_user.school_id, frm=frm, to=to)


# ---------- emergency escalation ----------


@router.get("/emergency/thin", summary="Children with nobody, or only one person, to ring")
def thin_chains(current_user: Health, db: Db):
    return svc.missing_chains(db, current_user.school_id)


@router.get("/emergency/{student_id}", summary="The chain for one child")
def chain(student_id: int, current_user: Health, db: Db):
    return svc.escalation_chain(db, current_user.school_id, student_id)


@router.post("/emergency/{student_id}", status_code=status.HTTP_201_CREATED,
             summary="Add the next person to ring")
def add_contact(student_id: int, payload: EscalationIn, current_user: Health, db: Db):
    return svc.add_escalation(
        db, current_user.school_id, current_user.tenant_id, student_id,
        contact_name=payload.contact_name, relationship=payload.relationship,
        phone=payload.phone, notes=payload.notes, availability=payload.availability,
    )


@router.put("/emergency/{student_id}/order", summary="Reorder the chain")
def reorder(student_id: int, payload: ReorderIn, current_user: Health, db: Db):
    return svc.reorder_escalation(
        db, current_user.school_id, student_id, payload.ordered_ids
    )


@router.delete("/emergency/contacts/{escalation_id}",
               summary="Remove a link; the chain closes up behind it")
def remove_contact(escalation_id: int, current_user: Health, db: Db):
    return svc.remove_escalation(db, current_user.school_id, escalation_id)


# ---------- a vaccination drive ----------


@router.post("/immunisation/bulk", status_code=status.HTTP_201_CREATED,
             summary="Record a whole section at once")
def bulk_immunise(payload: BulkImmuniseIn, current_user: Health, db: Db):
    return svc.bulk_immunise(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        section_id=payload.section_id, vaccine=payload.vaccine,
        given_on=payload.given_on, dose=payload.dose,
        next_due_on=payload.next_due_on, skip_student_ids=payload.skip_student_ids,
    )


# ---------- marking a sanction served ----------


@router.get("/discipline/actions", summary="Sanctions, and which are outstanding")
def list_actions(current_user: Discipline, db: Db,
                 outstanding_only: bool = False,
                 frm: Optional[date] = Query(None, alias="from"),
                 to: Optional[date] = None):
    return svc.list_actions(
        db, current_user.school_id, outstanding_only=outstanding_only, frm=frm, to=to
    )


@router.post("/discipline/actions/{action_id}/serve", summary="Mark it served")
def mark_served(action_id: int, payload: ServedIn, current_user: Discipline, db: Db):
    return svc.mark_served(
        db, current_user.school_id, current_user.id, action_id,
        served_on=payload.served_on,
    )


@router.delete("/discipline/actions/{action_id}/serve",
               summary="Undo a sign-off made by mistake")
def unmark_served(action_id: int, current_user: Discipline, db: Db):
    return svc.unmark_served(db, current_user.school_id, action_id)
