"""Recruitment and leave entitlement.

Recruitment runs opening -> candidate -> application -> interviews -> offer.
Accepting an offer can create the staff member and their login in one step.

Leave: each leave type carries a yearly entitlement. Balances are per staff
member, per type, per calendar year; approving a staff leave request uses days
up, and cancelling or rejecting gives them back."""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify, storage
from app.core.enums import (
    ApplicationStage,
    InterviewStatus,
    OfferStatus,
    OpeningStatus,
    StaffLeaveStatus,
    UserRole,
)
from app.core.scoping import school_today
from app.models.foundation import Department
from app.models.hr import (
    Candidate,
    CandidateApplication,
    InterviewSchedule,
    JobOpening,
    LeaveBalance,
    LeaveType,
    Offer,
)
from app.models.staff import Staff
from app.models.staff_leave import StaffLeave
from app.models.user import User
from app.schemas.hr import (
    ApplicationIn,
    BalanceAdjustIn,
    CandidateIn,
    FeedbackIn,
    InterviewIn,
    LeaveTypeIn,
    OfferIn,
    OfferRespondIn,
    OpeningIn,
    StageIn,
)

ZERO = Decimal("0.0")
OPEN_STAGES = (ApplicationStage.applied, ApplicationStage.screening, ApplicationStage.shortlisted,
               ApplicationStage.interview, ApplicationStage.offered)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _days(v: Decimal) -> Decimal:
    return Decimal(v).quantize(Decimal("0.1"))


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


# ---------- openings ----------


def _next_ref(db: Session, school_id: int) -> str:
    today = school_today(db, school_id)
    like = f"JOB-{today:%y}-%"
    n = db.execute(
        select(func.count()).select_from(JobOpening).where(JobOpening.school_id == school_id, JobOpening.reference_no.like(like))
    ).scalar_one()
    return f"JOB-{today:%y}-{n + 1:03d}"


def get_opening(db: Session, opening_id: int, school_id: int) -> JobOpening:
    o = db.get(JobOpening, opening_id)
    if not o or o.school_id != school_id:
        raise _404("Opening")
    return o


def _check_opening(db: Session, school_id: int, data: OpeningIn) -> None:
    if data.department_id is not None:
        d = db.get(Department, data.department_id)
        if not d or d.school_id != school_id:
            raise _400("Unknown department")
    if data.salary_min is not None and data.salary_max is not None and data.salary_max < data.salary_min:
        raise _400("The top of the salary range is below the bottom")


def create_opening(db: Session, user: User, data: OpeningIn) -> JobOpening:
    _check_opening(db, user.school_id, data)
    o = JobOpening(tenant_id=user.tenant_id, school_id=user.school_id, created_by_user_id=user.id,
                   reference_no=_next_ref(db, user.school_id), **data.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def update_opening(db: Session, user: User, opening_id: int, data: OpeningIn) -> JobOpening:
    o = get_opening(db, opening_id, user.school_id)
    _check_opening(db, user.school_id, data)
    for k, v in data.model_dump().items():
        setattr(o, k, v)
    db.commit()
    db.refresh(o)
    return o


def set_opening_status(db: Session, user: User, opening_id: int, new: OpeningStatus) -> JobOpening:
    o = get_opening(db, opening_id, user.school_id)
    if new == OpeningStatus.open and not o.posted_on:
        o.posted_on = school_today(db, o.school_id)
    o.status = new
    db.commit()
    db.refresh(o)
    return o


def delete_opening(db: Session, user: User, opening_id: int) -> None:
    o = get_opening(db, opening_id, user.school_id)
    if db.execute(select(CandidateApplication.id).where(CandidateApplication.opening_id == o.id).limit(1)).first():
        raise _400("People have applied; close the opening instead")
    db.delete(o)
    db.commit()


def list_openings(db: Session, school_id: int, status_: Optional[OpeningStatus], public_only: bool = False) -> list[JobOpening]:
    stmt = select(JobOpening).where(JobOpening.school_id == school_id)
    if public_only:
        stmt = stmt.where(JobOpening.status == OpeningStatus.open, JobOpening.is_public.is_(True))
    elif status_:
        stmt = stmt.where(JobOpening.status == status_)
    return list(db.execute(stmt.order_by(JobOpening.id.desc())).scalars())


def openings_to_read(db: Session, items: list[JobOpening]) -> list[dict]:
    if not items:
        return []
    depts = dict(db.execute(
        select(Department.id, Department.name).where(Department.id.in_({o.department_id for o in items if o.department_id} or {-1}))
    ).all())
    counts = dict(db.execute(
        select(CandidateApplication.opening_id, func.count())
        .where(CandidateApplication.opening_id.in_([o.id for o in items])).group_by(CandidateApplication.opening_id)
    ).all())
    hired = dict(db.execute(
        select(CandidateApplication.opening_id, func.count())
        .where(CandidateApplication.opening_id.in_([o.id for o in items]), CandidateApplication.stage == ApplicationStage.hired)
        .group_by(CandidateApplication.opening_id)
    ).all())
    return [
        dict(id=o.id, reference_no=o.reference_no, title=o.title, department_id=o.department_id,
             department_name=depts.get(o.department_id), employment_type=o.employment_type, vacancies=o.vacancies,
             description=o.description, requirements=o.requirements, salary_min=o.salary_min, salary_max=o.salary_max,
             status=o.status, is_public=o.is_public, posted_on=o.posted_on, closes_on=o.closes_on,
             applications=counts.get(o.id, 0), hired=hired.get(o.id, 0))
        for o in items
    ]


# ---------- candidates ----------


def get_candidate(db: Session, candidate_id: int, school_id: int) -> Candidate:
    c = db.get(Candidate, candidate_id)
    if not c or c.school_id != school_id:
        raise _404("Candidate")
    return c


def upsert_candidate(db: Session, tenant_id: int, school_id: int, data: CandidateIn) -> Candidate:
    email = data.email.strip().lower()
    c = db.execute(
        select(Candidate).where(Candidate.school_id == school_id, func.lower(Candidate.email) == email)
    ).scalar_one_or_none()
    if not c:
        c = Candidate(tenant_id=tenant_id, school_id=school_id, email=email)
        db.add(c)
    for k, v in data.model_dump(exclude={"email"}).items():
        if v is not None or k == "notes":
            setattr(c, k, v)
    db.flush()
    return c


def save_resume(db: Session, user: User, candidate_id: int, upload: UploadFile) -> Candidate:
    c = get_candidate(db, candidate_id, user.school_id)
    info = storage.save_upload(user.school_id, "resumes", upload)
    old = c.resume_key
    c.resume_key, c.resume_name = info["key"], info["original_name"]
    db.commit()
    if old:
        storage.delete(old)
    db.refresh(c)
    return c


def list_candidates(db: Session, school_id: int, search: Optional[str]) -> list[Candidate]:
    stmt = select(Candidate).where(Candidate.school_id == school_id)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Candidate.full_name.ilike(like), Candidate.email.ilike(like), Candidate.phone.ilike(like)))
    return list(db.execute(stmt.order_by(Candidate.full_name).limit(300)).scalars())


def candidate_to_read(db: Session, c: Candidate) -> dict:
    n = db.execute(
        select(func.count()).select_from(CandidateApplication).where(CandidateApplication.candidate_id == c.id)
    ).scalar_one()
    return dict(id=c.id, full_name=c.full_name, email=c.email, phone=c.phone, source=c.source,
                qualification=c.qualification, experience_years=c.experience_years,
                current_employer=c.current_employer, notes=c.notes, has_resume=bool(c.resume_key),
                resume_name=c.resume_name, applications=n)


# ---------- applications ----------


def get_application(db: Session, application_id: int, school_id: int) -> CandidateApplication:
    a = db.get(CandidateApplication, application_id)
    if not a or a.school_id != school_id:
        raise _404("Application")
    return a


def apply(db: Session, tenant_id: int, school_id: int, opening_id: int, data: CandidateIn,
          notes: Optional[str] = None) -> CandidateApplication:
    o = get_opening(db, opening_id, school_id)
    if o.status != OpeningStatus.open:
        raise _400("This opening isn't taking applications")
    if o.closes_on and o.closes_on < school_today(db, school_id):
        raise _400("Applications for this opening have closed")
    c = upsert_candidate(db, tenant_id, school_id, data)
    existing = db.execute(
        select(CandidateApplication).where(CandidateApplication.opening_id == o.id, CandidateApplication.candidate_id == c.id)
    ).scalar_one_or_none()
    if existing:
        raise _400("This candidate has already applied for this opening")
    a = CandidateApplication(tenant_id=tenant_id, school_id=school_id, opening_id=o.id, candidate_id=c.id,
                             applied_on=school_today(db, school_id), notes=notes)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def move_stage(db: Session, user: User, application_id: int, data: StageIn) -> CandidateApplication:
    a = get_application(db, application_id, user.school_id)
    if a.stage == ApplicationStage.hired:
        raise _400("This candidate has already been hired")
    if data.stage == ApplicationStage.hired:
        raise _400("Accept an offer to mark someone as hired")
    if data.stage == ApplicationStage.rejected and not (data.reason or "").strip():
        raise _400("Give a reason when rejecting")
    a.stage = data.stage
    if data.rating is not None:
        a.rating = data.rating
    if data.notes is not None:
        a.notes = data.notes
    a.rejected_reason = data.reason if data.stage == ApplicationStage.rejected else None
    db.commit()
    db.refresh(a)
    return a


def list_applications(db: Session, school_id: int, opening_id: Optional[int], stage: Optional[ApplicationStage],
                      candidate_id: Optional[int]) -> list[CandidateApplication]:
    stmt = select(CandidateApplication).where(CandidateApplication.school_id == school_id)
    if opening_id:
        stmt = stmt.where(CandidateApplication.opening_id == opening_id)
    if stage:
        stmt = stmt.where(CandidateApplication.stage == stage)
    if candidate_id:
        stmt = stmt.where(CandidateApplication.candidate_id == candidate_id)
    return list(db.execute(stmt.order_by(CandidateApplication.id.desc()).limit(500)).scalars())


def applications_to_read(db: Session, items: list[CandidateApplication], with_detail: bool = False) -> list[dict]:
    if not items:
        return []
    cands = {c.id: c for c in db.execute(select(Candidate).where(Candidate.id.in_({a.candidate_id for a in items}))).scalars()}
    openings = {o.id: o for o in db.execute(select(JobOpening).where(JobOpening.id.in_({a.opening_id for a in items}))).scalars()}
    ids = [a.id for a in items]
    interviews: dict[int, list] = {}
    offers: dict[int, Offer] = {}
    if with_detail:
        rows = list(db.execute(
            select(InterviewSchedule).where(InterviewSchedule.application_id.in_(ids)).order_by(InterviewSchedule.round_no)
        ).scalars())
        panel = _names(db, {u for r in rows for u in (r.panel_user_ids or [])})
        for r in rows:
            interviews.setdefault(r.application_id, []).append(dict(
                id=r.id, round_no=r.round_no, scheduled_at=r.scheduled_at, minutes=r.minutes, mode=r.mode,
                place_or_link=r.place_or_link, panel_user_ids=r.panel_user_ids or [],
                panel_names=[panel.get(u, "") for u in (r.panel_user_ids or [])], status=r.status,
                feedback=r.feedback, rating=r.rating, recommended=r.recommended,
            ))
        for o in db.execute(select(Offer).where(Offer.application_id.in_(ids)).order_by(Offer.id.desc())).scalars():
            offers.setdefault(o.application_id, o)
    out = []
    for a in items:
        c = cands.get(a.candidate_id)
        o = openings.get(a.opening_id)
        off = offers.get(a.id)
        out.append(dict(
            id=a.id, opening_id=a.opening_id, opening_title=o.title if o else "", candidate_id=a.candidate_id,
            candidate_name=c.full_name if c else "", candidate_email=c.email if c else "",
            candidate_phone=c.phone if c else None, qualification=c.qualification if c else None,
            experience_years=c.experience_years if c else None, has_resume=bool(c and c.resume_key),
            applied_on=a.applied_on, stage=a.stage, rating=a.rating, notes=a.notes,
            rejected_reason=a.rejected_reason, hired_staff_id=a.hired_staff_id,
            interviews=interviews.get(a.id, []),
            offer=offer_to_dict(db, off) if off else None,
        ))
    return out


# ---------- interviews ----------


def schedule_interview(db: Session, user: User, application_id: int, data: InterviewIn) -> InterviewSchedule:
    a = get_application(db, application_id, user.school_id)
    if a.stage in (ApplicationStage.rejected, ApplicationStage.withdrawn, ApplicationStage.hired):
        raise _400("This application is no longer active")
    panel = list(db.execute(
        select(User).where(User.id.in_(data.panel_user_ids or []), User.school_id == user.school_id, User.is_active.is_(True))
    ).scalars())
    if len(panel) != len(set(data.panel_user_ids or [])):
        raise _400("Pick panel members from this school's staff")
    round_no = data.round_no or (db.execute(
        select(func.coalesce(func.max(InterviewSchedule.round_no), 0)).where(InterviewSchedule.application_id == a.id)
    ).scalar_one() + 1)
    i = InterviewSchedule(tenant_id=a.tenant_id, school_id=a.school_id, application_id=a.id, round_no=round_no,
                          **data.model_dump(exclude={"round_no"}))
    db.add(i)
    if a.stage in (ApplicationStage.applied, ApplicationStage.screening, ApplicationStage.shortlisted):
        a.stage = ApplicationStage.interview
    c = db.get(Candidate, a.candidate_id)
    if panel:
        notify.staff_users(db, tenant_id=a.tenant_id, school_id=a.school_id, user_ids=[p.id for p in panel],
                           title=f"Interview: {c.full_name}",
                           body=f"Round {round_no} on {data.scheduled_at:%d %b %H:%M} ({data.mode.value.replace('_', ' ')}).")
    db.commit()
    db.refresh(i)
    return i


def interview_feedback(db: Session, user: User, interview_id: int, data: FeedbackIn) -> InterviewSchedule:
    i = db.get(InterviewSchedule, interview_id)
    if not i or i.school_id != user.school_id:
        raise _404("Interview")
    if data.status == InterviewStatus.done and not (data.feedback or "").strip():
        raise _400("Write the feedback when marking an interview done")
    i.status, i.feedback, i.rating, i.recommended = data.status, data.feedback, data.rating, data.recommended
    i.recorded_by_user_id = user.id
    db.commit()
    db.refresh(i)
    return i


def cancel_interview(db: Session, user: User, interview_id: int) -> None:
    i = db.get(InterviewSchedule, interview_id)
    if not i or i.school_id != user.school_id:
        raise _404("Interview")
    if i.status == InterviewStatus.done:
        raise _400("A finished interview can't be removed")
    db.delete(i)
    db.commit()


# ---------- offers ----------


def offer_to_dict(db: Session, off: Offer) -> dict:
    dept = db.get(Department, off.department_id) if off.department_id else None
    manager = db.get(Staff, off.reporting_manager_id) if off.reporting_manager_id else None
    return dict(id=off.id, role_title=off.role_title, annual_salary=off.annual_salary,
                joining_date=off.joining_date, valid_till=off.valid_till, status=off.status,
                terms=off.terms, sent_at=off.sent_at, responded_at=off.responded_at,
                response_note=off.response_note,
                department_id=off.department_id, department_name=dept.name if dept else None,
                reporting_manager_id=off.reporting_manager_id,
                reporting_manager_name=manager.user.full_name if manager else None)


def create_offer(db: Session, user: User, application_id: int, data: OfferIn) -> Offer:
    a = get_application(db, application_id, user.school_id)
    if a.stage in (ApplicationStage.rejected, ApplicationStage.withdrawn, ApplicationStage.hired):
        raise _400("This application is no longer active")
    live = db.execute(
        select(Offer).where(Offer.application_id == a.id, Offer.status.in_([OfferStatus.draft, OfferStatus.sent, OfferStatus.accepted]))
    ).scalar_one_or_none()
    if live:
        raise _400("There's already an open offer for this candidate")
    if data.valid_till and data.valid_till < school_today(db, user.school_id):
        raise _400("The offer expires in the past")
    if data.department_id is not None:
        from app.services import foundation_service

        foundation_service.check_department(db, user.school_id, data.department_id)
    if data.reporting_manager_id is not None:
        from app.services import staff_service

        staff_service.check_reporting_manager(db, user.school_id, data.reporting_manager_id)
    o = Offer(tenant_id=a.tenant_id, school_id=a.school_id, application_id=a.id, created_by_user_id=user.id,
              **data.model_dump())
    db.add(o)
    a.stage = ApplicationStage.offered
    db.commit()
    db.refresh(o)
    return o


def send_offer(db: Session, user: User, offer_id: int) -> Offer:
    o = _get_offer(db, offer_id, user.school_id)
    if o.status != OfferStatus.draft:
        raise _400("Only a draft offer can be sent")
    o.status, o.sent_at = OfferStatus.sent, datetime.now(timezone.utc)
    db.commit()
    db.refresh(o)
    return o


def _get_offer(db: Session, offer_id: int, school_id: int) -> Offer:
    o = db.get(Offer, offer_id)
    if not o or o.school_id != school_id:
        raise _404("Offer")
    return o


def respond_to_offer(db: Session, user: User, offer_id: int, data: OfferRespondIn) -> Offer:
    o = _get_offer(db, offer_id, user.school_id)
    if o.status not in (OfferStatus.draft, OfferStatus.sent):
        raise _400("This offer has already been answered")
    a = db.get(CandidateApplication, o.application_id)
    if data.accept:
        o.status = OfferStatus.accepted
        a.stage = ApplicationStage.offered
    else:
        o.status = OfferStatus.declined
        a.stage = ApplicationStage.rejected
        a.rejected_reason = data.note or "Offer declined"
    o.responded_at, o.response_note = datetime.now(timezone.utc), data.note
    db.commit()
    db.refresh(o)
    return o


def withdraw_offer(db: Session, user: User, offer_id: int, note: Optional[str]) -> Offer:
    o = _get_offer(db, offer_id, user.school_id)
    if o.status in (OfferStatus.accepted, OfferStatus.declined):
        raise _400("This offer has already been answered")
    o.status, o.response_note, o.responded_at = OfferStatus.withdrawn, note, datetime.now(timezone.utc)
    db.commit()
    db.refresh(o)
    return o


def hire(db: Session, user: User, offer_id: int, employee_no: str, role: str) -> dict:
    """Turn an accepted offer into a staff member with a login."""
    from app.schemas.staff import StaffCreate
    from app.services import staff_service

    o = _get_offer(db, offer_id, user.school_id)
    if o.status != OfferStatus.accepted:
        raise _400("The candidate must accept the offer first")
    a = db.get(CandidateApplication, o.application_id)
    if a.hired_staff_id:
        raise _400("This candidate is already on the staff list")
    c = db.get(Candidate, a.candidate_id)
    staff, password = staff_service.create_staff(db, user.tenant_id, user.school_id, StaffCreate(
        full_name=c.full_name, email=c.email, phone=c.phone, role=role, employee_no=employee_no,
        designation=o.role_title, joining_date=o.joining_date,
        department_id=o.department_id or db.get(JobOpening, a.opening_id).department_id,
        reporting_manager_id=o.reporting_manager_id,
        employment_type=db.get(JobOpening, a.opening_id).employment_type,
    ))
    a.stage, a.hired_staff_id = ApplicationStage.hired, staff.id
    db.flush()  # count the new hire below
    opening = db.get(JobOpening, a.opening_id)
    hired = db.execute(
        select(func.count()).select_from(CandidateApplication)
        .where(CandidateApplication.opening_id == opening.id, CandidateApplication.stage == ApplicationStage.hired)
    ).scalar_one()
    if hired >= opening.vacancies:
        opening.status = OpeningStatus.filled
    db.commit()
    return dict(staff_id=staff.id, user_id=staff.user_id, employee_no=staff.employee_no,
                temporary_password=password, opening_status=opening.status)


def pipeline(db: Session, school_id: int) -> dict:
    rows = db.execute(
        select(CandidateApplication.stage, func.count()).where(CandidateApplication.school_id == school_id)
        .group_by(CandidateApplication.stage)
    ).all()
    by_stage = {s.value: n for s, n in rows}
    openings = list_openings(db, school_id, None)
    return dict(
        by_stage=by_stage,
        open_positions=sum(o.vacancies for o in openings if o.status == OpeningStatus.open),
        openings_open=sum(1 for o in openings if o.status == OpeningStatus.open),
        in_progress=sum(by_stage.get(s.value, 0) for s in OPEN_STAGES),
    )


# ---------- leave types & balances ----------


def list_leave_types(db: Session, school_id: int) -> list[LeaveType]:
    return list(db.execute(
        select(LeaveType).where(LeaveType.school_id == school_id).order_by(LeaveType.name)
    ).scalars())


def _check_approver(db: Session, school_id: int, approver_user_id: Optional[int]) -> None:
    """The approver has to be somebody who can decide leave at all."""
    if approver_user_id is None:
        return
    u = db.get(User, approver_user_id)
    if not u or u.school_id != school_id or not u.is_active:
        raise _400("Unknown approver")
    if u.role not in (UserRole.school_admin, UserRole.principal):
        raise _400("Only the principal or a school admin can approve leave")


def create_leave_type(db: Session, user: User, data: LeaveTypeIn) -> LeaveType:
    _check_approver(db, user.school_id, data.approver_user_id)
    t = LeaveType(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    db.add(t)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("That code is already used")
    db.refresh(t)
    return t


def update_leave_type(db: Session, user: User, type_id: int, data: LeaveTypeIn) -> LeaveType:
    t = db.get(LeaveType, type_id)
    if not t or t.school_id != user.school_id:
        raise _404("Leave type")
    _check_approver(db, user.school_id, data.approver_user_id)
    for k, v in data.model_dump().items():
        setattr(t, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("That code is already used")
    db.refresh(t)
    return t


def delete_leave_type(db: Session, user: User, type_id: int) -> None:
    t = db.get(LeaveType, type_id)
    if not t or t.school_id != user.school_id:
        raise _404("Leave type")
    used = db.execute(select(StaffLeave.id).where(StaffLeave.leave_type_id == t.id).limit(1)).first()
    if used:
        raise _400("Leave has been taken under this type; deactivate it instead")
    db.execute(LeaveBalance.__table__.delete().where(LeaveBalance.leave_type_id == t.id))
    db.delete(t)
    db.commit()


def _staff_users(db: Session, school_id: int) -> list[User]:
    return list(db.execute(
        select(User).join(Staff, Staff.user_id == User.id)
        .where(User.school_id == school_id, User.is_active.is_(True)).order_by(User.full_name)
    ).scalars())


def allot_year(db: Session, user: User, year: int, carry_forward: bool) -> dict:
    """Create this year's balances for every staff member, once per type."""
    types = [t for t in list_leave_types(db, user.school_id) if t.is_active]
    staff = _staff_users(db, user.school_id)
    existing = {
        (b.user_id, b.leave_type_id): b for b in db.execute(
            select(LeaveBalance).where(LeaveBalance.school_id == user.school_id, LeaveBalance.year == year)
        ).scalars()
    }
    last = {
        (b.user_id, b.leave_type_id): b for b in db.execute(
            select(LeaveBalance).where(LeaveBalance.school_id == user.school_id, LeaveBalance.year == year - 1)
        ).scalars()
    }
    created = updated = 0
    for u in staff:
        for t in types:
            cf = ZERO
            if carry_forward and t.carry_forward_max > 0:
                prev = last.get((u.id, t.id))
                if prev:
                    left = prev.allotted + prev.carried_forward + prev.adjustment - prev.used
                    cf = _days(min(max(left, ZERO), t.carry_forward_max))
            b = existing.get((u.id, t.id))
            if b:
                if b.allotted != t.annual_days or b.carried_forward != cf:
                    b.allotted, b.carried_forward = t.annual_days, cf
                    updated += 1
                continue
            db.add(LeaveBalance(tenant_id=user.tenant_id, school_id=user.school_id, user_id=u.id, leave_type_id=t.id,
                                year=year, allotted=t.annual_days, carried_forward=cf))
            created += 1
    db.commit()
    return dict(year=year, staff=len(staff), types=len(types), created=created, updated=updated)


def adjust_balance(db: Session, user: User, balance_id: int, data: BalanceAdjustIn) -> LeaveBalance:
    b = db.get(LeaveBalance, balance_id)
    if not b or b.school_id != user.school_id:
        raise _404("Balance")
    b.adjustment, b.note = data.adjustment, data.note
    db.commit()
    db.refresh(b)
    return b


def balances(db: Session, school_id: int, year: int, user_id: Optional[int]) -> list[dict]:
    stmt = select(LeaveBalance).where(LeaveBalance.school_id == school_id, LeaveBalance.year == year)
    if user_id:
        stmt = stmt.where(LeaveBalance.user_id == user_id)
    rows = list(db.execute(stmt).scalars())
    names = _names(db, {b.user_id for b in rows})
    types = {t.id: t for t in list_leave_types(db, school_id)}
    out = []
    for b in rows:
        t = types.get(b.leave_type_id)
        entitled = b.allotted + b.carried_forward + b.adjustment
        out.append(dict(
            id=b.id, user_id=b.user_id, user_name=names.get(b.user_id, ""), leave_type_id=b.leave_type_id,
            leave_type_name=t.name if t else "", year=b.year, allotted=b.allotted, carried_forward=b.carried_forward,
            adjustment=b.adjustment, used=b.used, available=_days(entitled - b.used), note=b.note,
            is_paid=t.is_paid if t else True,
        ))
    out.sort(key=lambda r: (r["user_name"], r["leave_type_name"]))
    return out


def _balance_for(db: Session, user_id: int, leave_type_id: int, year: int) -> Optional[LeaveBalance]:
    return db.execute(
        select(LeaveBalance).where(
            LeaveBalance.user_id == user_id, LeaveBalance.leave_type_id == leave_type_id, LeaveBalance.year == year
        )
    ).scalar_one_or_none()


def check_balance(db: Session, leave: StaffLeave) -> None:
    """Refuse a request that would go past the entitlement (paid types only)."""
    if not leave.leave_type_id:
        return
    t = db.get(LeaveType, leave.leave_type_id)
    if not t or not t.is_paid or t.annual_days <= 0:
        return
    days = Decimal((leave.to_date - leave.from_date).days + 1)
    b = _balance_for(db, leave.applicant_user_id, t.id, leave.from_date.year)
    if not b:
        return  # no allotment run yet: don't block
    available = b.allotted + b.carried_forward + b.adjustment - b.used
    if days > available:
        raise _400(f"Only {_days(available)} day(s) of {t.name} left this year")
    if t.document_after_days and days > t.document_after_days:
        # not a hard stop, but worth saying
        pass


def consume(db: Session, leave: StaffLeave, sign: int = 1) -> None:
    """Move days out of (sign=1) or back into (sign=-1) the balance."""
    if not leave.leave_type_id:
        return
    b = _balance_for(db, leave.applicant_user_id, leave.leave_type_id, leave.from_date.year)
    if not b:
        return
    days = Decimal((leave.to_date - leave.from_date).days + 1) * sign
    b.used = _days(max(b.used + days, ZERO))


def my_balances(db: Session, user: User, year: int) -> list[dict]:
    return balances(db, user.school_id, year, user.id)


# ---------- offer letter ----------


def offer_letter_pdf(db: Session, school_id: int, offer_id: int) -> tuple[bytes, str]:
    """The offer as a letter to post or email, rendered the way certificates
    and receipts are (reportlab). It is printed while the offer is a draft
    (that is when the letter goes out); a withdrawn, declined or expired
    offer still prints, stamped, so a file copy says what became of it."""
    import io
    from html import escape

    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from app.models.tenant import School

    o = _get_offer(db, offer_id, school_id)
    a = db.get(CandidateApplication, o.application_id)
    c = db.get(Candidate, a.candidate_id) if a else None
    opening = db.get(JobOpening, a.opening_id) if a else None
    school = db.get(School, school_id)
    info = offer_to_dict(db, o)
    signer = db.get(User, o.created_by_user_id) if o.created_by_user_id else None

    styles = getSampleStyleSheet()
    center = ParagraphStyle("c", parent=styles["Normal"], alignment=TA_CENTER, fontSize=10)
    body = ParagraphStyle("b", parent=styles["Normal"], fontSize=11, leading=17)
    title = ParagraphStyle("t", parent=styles["Title"], fontSize=15, spaceBefore=4)

    stamp = {
        OfferStatus.withdrawn: "WITHDRAWN",
        OfferStatus.declined: "DECLINED",
        OfferStatus.expired: "EXPIRED",
    }.get(o.status)

    def watermark(canvas, _doc):
        if stamp:
            canvas.saveState()
            canvas.setFont("Helvetica-Bold", 70)
            canvas.setFillColor(colors.Color(0.6, 0.6, 0.6, alpha=0.18))
            canvas.translate(A4[0] / 2, A4[1] / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, stamp)
            canvas.restoreState()

    def e(v) -> str:
        return escape(str(v)) if v is not None else ""

    def fmt(d) -> str:
        return d.strftime("%d %B %Y") if d else "—"

    issued = o.sent_at.date() if o.sent_at else school_today(db, school_id)
    name = c.full_name if c else "Candidate"
    school_name = school.name if school else "the school"
    contact = " · ".join(x for x in [getattr(school, "phone_primary", None), getattr(school, "email", None)] if x)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2.2 * cm, rightMargin=2.2 * cm,
                            topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    els = [
        Paragraph(f"<b>{e(school_name.upper())}</b>", ParagraphStyle("h", parent=styles["Title"], fontSize=20)),
        Paragraph(e(getattr(school, "address", None) or ""), center),
        Paragraph(e(contact), center),
        Spacer(1, 0.3 * cm),
        HRFlowable(width="100%", thickness=1.2, color=colors.black),
        Spacer(1, 0.4 * cm),
        Paragraph(f"Ref. OFFER/{o.id}", body),
        Paragraph(f"Date: {fmt(issued)}", body),
        Spacer(1, 0.4 * cm),
        Paragraph(f"To<br/><b>{e(name)}</b><br/>{e(c.email if c else '')}", body),
        Spacer(1, 0.4 * cm),
        Paragraph("<u>Offer of Appointment</u>", title),
        Spacer(1, 0.3 * cm),
        Paragraph(f"Dear {e(name)},", body),
        Spacer(1, 0.2 * cm),
        Paragraph(
            f"We are pleased to offer you the position of <b>{e(o.role_title)}</b> at "
            f"{e(school_name)}, on the terms set out below.",
            body,
        ),
        Spacer(1, 0.35 * cm),
    ]
    kind = opening.employment_type.value.replace("_", " ").capitalize() if opening else "—"
    rows = [
        ["Position", o.role_title],
        ["Department", info["department_name"] or "—"],
        ["Reporting to", info["reporting_manager_name"] or "—"],
        ["Employment type", kind],
        ["Annual salary", f"Rs. {o.annual_salary:,.2f}"],
        ["Date of joining", fmt(o.joining_date)],
        ["Please reply by", fmt(o.valid_till)],
    ]
    table = Table(rows, colWidths=[5 * cm, 11.6 * cm])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10.5),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.95, 0.96, 0.98)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    els += [table, Spacer(1, 0.45 * cm)]
    if o.terms:
        els.append(Paragraph("<b>Terms and conditions</b>", body))
        for para in o.terms.split("\n\n"):
            els.append(Paragraph(e(para).replace("\n", "<br/>"), body))
            els.append(Spacer(1, 0.2 * cm))
        els.append(Spacer(1, 0.25 * cm))
    body_small = ParagraphStyle("bs", parent=body, fontSize=10.5, leading=15)
    reply = (
        f"Please confirm your acceptance by signing and returning a copy of this letter on or before {fmt(o.valid_till)}."
        if o.valid_till
        else "Please confirm your acceptance by signing and returning a copy of this letter."
    )
    els += [
        Paragraph(reply, body),
        Spacer(1, 0.9 * cm),
        Paragraph("Yours sincerely,", body),
        Spacer(1, 0.8 * cm),
        Paragraph(f"<b>{e(signer.full_name if signer else '')}</b><br/>For {e(school_name)}", body),
        Spacer(1, 0.6 * cm),
        HRFlowable(width="100%", thickness=0.5, color=colors.grey),
        Spacer(1, 0.3 * cm),
        Paragraph(
            f"I accept this offer.<br/><br/>Signature: ____________________ &nbsp;&nbsp; Date: ____________<br/>{e(name)}",
            body_small,
        ),
    ]
    doc.build(els, onFirstPage=watermark, onLaterPages=watermark)
    safe = "".join(ch if ch.isalnum() else "_" for ch in name).strip("_") or "candidate"
    return buf.getvalue(), f"offer_letter_{safe}.pdf"
