"""Admission applications: form, documents, entrance assessments, decision.

The flow is draft -> submitted -> verification -> assessment -> approved ->
fee pending -> admitted, with rejected and withdrawn as endings. Every move is
written to the history so the school can show how a decision was reached.
Admitting creates the student through the normal student flow."""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import notify, storage
from app.core.enums import AdmissionStage, ApplicationStatus, AssessmentStatus, UserRole
from app.core.scoping import school_today
from app.models.academic import AcademicYear, SchoolClass
from app.models.admission import AdmissionEnquiry
from app.models.application import (
    AdmissionApplication,
    AdmissionAssessment,
    ApplicationDocument,
    ApplicationStatusHistory,
)
from app.models.student import Student
from app.models.user import User
from app.schemas.application import (
    AdmitIn,
    ApplicationIn,
    AssessmentIn,
    AssessmentResultIn,
    DecideIn,
    FeeIn,
)

# what each status may become
NEXT = {
    ApplicationStatus.draft: {ApplicationStatus.submitted, ApplicationStatus.withdrawn},
    # an entrance assessment can be booked straight from a new application
    ApplicationStatus.submitted: {ApplicationStatus.verification, ApplicationStatus.assessment,
                                  ApplicationStatus.rejected, ApplicationStatus.withdrawn},
    ApplicationStatus.verification: {ApplicationStatus.assessment, ApplicationStatus.approved,
                                     ApplicationStatus.rejected, ApplicationStatus.withdrawn},
    ApplicationStatus.assessment: {ApplicationStatus.approved, ApplicationStatus.rejected, ApplicationStatus.withdrawn},
    ApplicationStatus.approved: {ApplicationStatus.fee_pending, ApplicationStatus.admitted,
                                 ApplicationStatus.rejected, ApplicationStatus.withdrawn},
    # back to approved once the fee is in, then admitted
    ApplicationStatus.fee_pending: {ApplicationStatus.approved, ApplicationStatus.admitted, ApplicationStatus.withdrawn},
    ApplicationStatus.admitted: set(),
    ApplicationStatus.rejected: {ApplicationStatus.verification},  # reopen after a mistake
    ApplicationStatus.withdrawn: {ApplicationStatus.submitted},
}
OPEN_STATUSES = (ApplicationStatus.draft, ApplicationStatus.submitted, ApplicationStatus.verification,
                 ApplicationStatus.assessment, ApplicationStatus.approved, ApplicationStatus.fee_pending)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


def next_number(db: Session, school_id: int) -> str:
    today = school_today(db, school_id)
    like = f"APP-{today:%y}-%"
    n = db.execute(
        select(func.count()).select_from(AdmissionApplication)
        .where(AdmissionApplication.school_id == school_id, AdmissionApplication.application_no.like(like))
    ).scalar_one()
    return f"APP-{today:%y}-{n + 1:04d}"


def get(db: Session, application_id: int, school_id: int) -> AdmissionApplication:
    a = db.get(AdmissionApplication, application_id)
    if not a or a.school_id != school_id:
        raise _404("Application")
    return a


def _history(db: Session, a: AdmissionApplication, to: ApplicationStatus, note: Optional[str], user_id: Optional[int]) -> None:
    db.add(ApplicationStatusHistory(
        tenant_id=a.tenant_id, school_id=a.school_id, application_id=a.id, from_status=a.status, to_status=to,
        note=note, changed_by_user_id=user_id, changed_at=_now(),
    ))


def _move(db: Session, a: AdmissionApplication, to: ApplicationStatus, note: Optional[str], user_id: Optional[int]) -> None:
    if to != a.status and to not in NEXT[a.status]:
        raise _400(f"An application that is {a.status.value.replace('_', ' ')} can't become {to.value.replace('_', ' ')}")
    if to != a.status:
        _history(db, a, to, note, user_id)
        a.status = to


def _check_refs(db: Session, school_id: int, data: ApplicationIn) -> None:
    if data.academic_year_id is not None:
        y = db.get(AcademicYear, data.academic_year_id)
        if not y or y.school_id != school_id:
            raise _400("Unknown academic year")
    if data.class_id is not None:
        c = db.get(SchoolClass, data.class_id)
        if not c or c.school_id != school_id:
            raise _400("Unknown class")


def create(db: Session, tenant_id: int, school_id: int, data: ApplicationIn, user_id: Optional[int],
           submitted: bool = False, enquiry_id: Optional[int] = None) -> AdmissionApplication:
    _check_refs(db, school_id, data)
    if enquiry_id is not None:
        e = db.get(AdmissionEnquiry, enquiry_id)
        if not e or e.school_id != school_id:
            raise _400("Unknown enquiry")
    a = AdmissionApplication(
        tenant_id=tenant_id, school_id=school_id, application_no=next_number(db, school_id),
        created_by_user_id=user_id, enquiry_id=enquiry_id,
        status=ApplicationStatus.submitted if submitted else ApplicationStatus.draft,
        submitted_at=_now() if submitted else None,
        **data.model_dump(),
    )
    db.add(a)
    db.flush()
    db.add(ApplicationStatusHistory(
        tenant_id=tenant_id, school_id=school_id, application_id=a.id, from_status=None, to_status=a.status,
        note="Application created", changed_by_user_id=user_id, changed_at=_now(),
    ))
    if enquiry_id:
        e = db.get(AdmissionEnquiry, enquiry_id)
        if e.stage in (AdmissionStage.enquiry, AdmissionStage.contacted, AdmissionStage.visit_scheduled,
                       AdmissionStage.visited):
            e.stage = AdmissionStage.applied
    db.commit()
    db.refresh(a)
    return a


def update(db: Session, user: User, application_id: int, data: ApplicationIn) -> AdmissionApplication:
    a = get(db, application_id, user.school_id)
    if a.status in (ApplicationStatus.admitted, ApplicationStatus.withdrawn):
        raise _400("This application can no longer be edited")
    _check_refs(db, user.school_id, data)
    for k, v in data.model_dump().items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a


def submit(db: Session, user: Optional[User], application_id: int, school_id: int) -> AdmissionApplication:
    a = get(db, application_id, school_id)
    if a.status != ApplicationStatus.draft:
        raise _400("Only a draft can be submitted")
    missing = [f for f, v in (("student's name", a.student_name), ("guardian", a.guardian_name), ("phone", a.phone)) if not v]
    if missing:
        raise _400("Fill in the " + ", ".join(missing))
    _move(db, a, ApplicationStatus.submitted, "Submitted", user.id if user else None)
    a.submitted_at = _now()
    db.commit()
    db.refresh(a)
    return a


def set_status(db: Session, user: User, application_id: int, to: ApplicationStatus, note: Optional[str]) -> AdmissionApplication:
    a = get(db, application_id, user.school_id)
    if to == ApplicationStatus.admitted:
        raise _400("Use 'admit' so the student record is created")
    _move(db, a, to, note, user.id)
    db.commit()
    db.refresh(a)
    return a


def decide(db: Session, user: User, application_id: int, data: DecideIn) -> AdmissionApplication:
    a = get(db, application_id, user.school_id)
    if a.status not in (ApplicationStatus.verification, ApplicationStatus.assessment, ApplicationStatus.submitted):
        raise _400("This application isn't waiting for a decision")
    if not data.approve and not (data.note or "").strip():
        raise _400("Give a reason when rejecting an application")
    if data.approve and a.status == ApplicationStatus.submitted:
        raise _400("Check the documents before approving")
    target = ApplicationStatus.approved if data.approve else ApplicationStatus.rejected
    _move(db, a, target, data.note, user.id)
    a.decided_by_user_id, a.decided_at, a.decision_note = user.id, _now(), data.note
    if data.approve and data.application_fee_due:
        _move(db, a, ApplicationStatus.fee_pending, "Waiting for the admission fee", user.id)
    db.commit()
    db.refresh(a)
    return a


def record_fee(db: Session, user: User, application_id: int, data: FeeIn) -> AdmissionApplication:
    a = get(db, application_id, user.school_id)
    if a.status not in (ApplicationStatus.approved, ApplicationStatus.fee_pending):
        raise _400("Only an approved application can take the admission fee")
    if data.paid_on > school_today(db, a.school_id):
        raise _400("The payment can't be in the future")
    a.application_fee, a.fee_paid_on, a.fee_receipt_no = data.amount, data.paid_on, data.receipt_no
    if a.status == ApplicationStatus.fee_pending:
        _move(db, a, ApplicationStatus.approved, f"Fee received ({data.amount})", user.id)
    db.commit()
    db.refresh(a)
    return a


def admit(db: Session, user: User, application_id: int, data: AdmitIn) -> dict:
    """Create the student from the application (and optionally a parent login)."""
    from app.schemas.parent import ParentCreate
    from app.schemas.student import StudentCreate
    from app.services import parent_service, student_service

    a = get(db, application_id, user.school_id)
    if a.status == ApplicationStatus.admitted:
        raise _400("This applicant has already been admitted")
    if a.status not in (ApplicationStatus.approved, ApplicationStatus.fee_pending):
        raise _400("Approve the application before admitting")
    if a.status == ApplicationStatus.fee_pending and not a.fee_paid_on:
        raise _400("Record the admission fee first")
    if data.admission_date and data.admission_date > date.today() + timedelta(days=366):
        raise _400("The admission date is more than a year away")
    student = student_service.create_student(db, a.tenant_id, a.school_id, StudentCreate(
        full_name=a.student_name, dob=a.dob, gender=a.gender, admission_no=data.admission_no,
        academic_year_id=data.academic_year_id, section_id=data.section_id,
    ))
    result = dict(application_id=a.id, student_id=student.id, admission_no=student.admission_no,
                  parent_user_id=None, parent_temporary_password=None, parent_login_note=None)
    if data.create_parent_login:
        if not a.email:
            result["parent_login_note"] = "No email on the application, so no parent login was created."
        else:
            try:
                parent, password = parent_service.create_parent(db, a.tenant_id, a.school_id, ParentCreate(
                    full_name=a.guardian_name, email=a.email, phone=a.phone, student_id=student.id,
                    relation=data.relation,
                ))
                result["parent_user_id"] = parent.id
                result["parent_temporary_password"] = password
            except HTTPException as e:
                result["parent_login_note"] = f"Student created, but the parent login wasn't: {e.detail}"
    if data.admission_date:
        from app.models.foundation import StudentEnrollment

        enr = db.execute(
            select(StudentEnrollment).where(
                StudentEnrollment.student_id == student.id,
                StudentEnrollment.academic_year_id == student.academic_year_id,
            )
        ).scalars().first()
        if enr:
            enr.start_date = data.admission_date
    note = f"Admitted as {student.admission_no}"
    if data.admission_date:
        note += f" from {data.admission_date:%d %b %Y}"
    _move(db, a, ApplicationStatus.admitted, note, user.id)
    a.student_id = student.id
    if a.enquiry_id:
        e = db.get(AdmissionEnquiry, a.enquiry_id)
        if e:
            e.stage = AdmissionStage.enrolled
    db.commit()
    return result


def withdraw(db: Session, user: User, application_id: int, note: Optional[str]) -> AdmissionApplication:
    a = get(db, application_id, user.school_id)
    if a.status == ApplicationStatus.admitted:
        raise _400("An admitted student can't be withdrawn here")
    _move(db, a, ApplicationStatus.withdrawn, note or "Withdrawn", user.id)
    db.commit()
    db.refresh(a)
    return a


def list_applications(db: Session, school_id: int, *, status_: Optional[ApplicationStatus], search: Optional[str],
                      academic_year_id: Optional[int], open_only: bool) -> list[AdmissionApplication]:
    stmt = select(AdmissionApplication).where(AdmissionApplication.school_id == school_id)
    if status_:
        stmt = stmt.where(AdmissionApplication.status == status_)
    elif open_only:
        stmt = stmt.where(AdmissionApplication.status.in_(OPEN_STATUSES))
    if academic_year_id:
        stmt = stmt.where(AdmissionApplication.academic_year_id == academic_year_id)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(
            AdmissionApplication.student_name.ilike(like), AdmissionApplication.application_no.ilike(like),
            AdmissionApplication.phone.ilike(like), AdmissionApplication.guardian_name.ilike(like),
        ))
    return list(db.execute(stmt.order_by(AdmissionApplication.id.desc()).limit(500)).scalars())


def to_read(db: Session, items: list[AdmissionApplication], with_detail: bool = False) -> list[dict]:
    if not items:
        return []
    classes = dict(db.execute(
        select(SchoolClass.id, SchoolClass.name).where(SchoolClass.id.in_({a.class_id for a in items if a.class_id} or {-1}))
    ).all())
    years = dict(db.execute(
        select(AcademicYear.id, AcademicYear.name).where(AcademicYear.id.in_({a.academic_year_id for a in items if a.academic_year_id} or {-1}))
    ).all())
    users = _names(db, {a.decided_by_user_id for a in items})
    ids = [a.id for a in items]
    docs: dict[int, list] = {}
    tests: dict[int, list] = {}
    history: dict[int, list] = {}
    doc_counts = dict(db.execute(
        select(ApplicationDocument.application_id, func.count()).where(ApplicationDocument.application_id.in_(ids))
        .group_by(ApplicationDocument.application_id)
    ).all())
    verified_counts = dict(db.execute(
        select(ApplicationDocument.application_id, func.count())
        .where(ApplicationDocument.application_id.in_(ids), ApplicationDocument.is_verified.is_(True))
        .group_by(ApplicationDocument.application_id)
    ).all())
    if with_detail:
        drows = list(db.execute(select(ApplicationDocument).where(ApplicationDocument.application_id.in_(ids))).scalars())
        uploaders = _names(db, {d.uploaded_by_user_id for d in drows})
        verifiers = _names(db, {d.verified_by_user_id for d in drows})
        for d in drows:
            docs.setdefault(d.application_id, []).append(dict(
                id=d.id, category=d.category, file_name=d.file_name, size_bytes=d.size_bytes,
                is_verified=d.is_verified, remark=d.remark, verified_at=d.verified_at,
                # who put this file on the application, and who checked it
                uploaded_at=d.created_at, uploaded_by_name=uploaders.get(d.uploaded_by_user_id),
                verified_by_name=verifiers.get(d.verified_by_user_id),
            ))
        rows = list(db.execute(
            select(AdmissionAssessment).where(AdmissionAssessment.application_id.in_(ids))
            .order_by(AdmissionAssessment.scheduled_at)
        ).scalars())
        assessors = _names(db, {t.assessor_user_id for t in rows})
        for t in rows:
            tests.setdefault(t.application_id, []).append(dict(
                id=t.id, kind=t.kind, scheduled_at=t.scheduled_at, venue=t.venue,
                assessor_user_id=t.assessor_user_id, assessor_name=assessors.get(t.assessor_user_id),
                max_marks=t.max_marks, marks_obtained=t.marks_obtained, status=t.status, passed=t.passed,
                remarks=t.remarks,
            ))
        hrows = list(db.execute(
            select(ApplicationStatusHistory).where(ApplicationStatusHistory.application_id.in_(ids))
            .order_by(ApplicationStatusHistory.id)
        ).scalars())
        changers = _names(db, {h.changed_by_user_id for h in hrows})
        for h in hrows:
            history.setdefault(h.application_id, []).append(dict(
                from_status=h.from_status, to_status=h.to_status, note=h.note,
                changed_by_name=changers.get(h.changed_by_user_id), changed_at=h.changed_at,
            ))
    out = []
    for a in items:
        out.append(dict(
            id=a.id, application_no=a.application_no, enquiry_id=a.enquiry_id, academic_year_id=a.academic_year_id,
            academic_year_name=years.get(a.academic_year_id), class_id=a.class_id,
            class_name=classes.get(a.class_id) or a.applying_for_class, applying_for_class=a.applying_for_class,
            student_name=a.student_name, dob=a.dob, gender=a.gender, previous_school=a.previous_school,
            sibling_in_school=a.sibling_in_school, transport_required=a.transport_required, category=a.category, father_name=a.father_name,
            mother_name=a.mother_name, guardian_name=a.guardian_name, phone=a.phone, email=a.email,
            address=a.address, notes=a.notes, status=a.status, submitted_at=a.submitted_at,
            decided_by_name=users.get(a.decided_by_user_id), decided_at=a.decided_at, decision_note=a.decision_note,
            application_fee=a.application_fee, fee_paid_on=a.fee_paid_on, fee_receipt_no=a.fee_receipt_no,
            student_id=a.student_id, documents_total=doc_counts.get(a.id, 0), documents_verified=verified_counts.get(a.id, 0),
            documents=docs.get(a.id, []), assessments=tests.get(a.id, []), history=history.get(a.id, []),
        ))
    return out


def detail(db: Session, school_id: int, application_id: int) -> dict:
    return to_read(db, [get(db, application_id, school_id)], with_detail=True)[0]


# ---------- documents ----------


def add_document(db: Session, user: User, application_id: int, category, upload: UploadFile,
                 remark: Optional[str]) -> ApplicationDocument:
    a = get(db, application_id, user.school_id)
    info = storage.save_upload(a.school_id, "applications", upload)
    d = ApplicationDocument(
        tenant_id=a.tenant_id, school_id=a.school_id, application_id=a.id, category=category,
        file_key=info["key"], file_name=info["original_name"], content_type=info["content_type"],
        size_bytes=info["size_bytes"], remark=remark, uploaded_by_user_id=user.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def get_document(db: Session, doc_id: int, school_id: int) -> ApplicationDocument:
    d = db.get(ApplicationDocument, doc_id)
    if not d or d.school_id != school_id:
        raise _404("Document")
    return d


def verify_document(db: Session, user: User, doc_id: int, ok: bool, remark: Optional[str]) -> ApplicationDocument:
    d = get_document(db, doc_id, user.school_id)
    d.is_verified = ok
    d.verified_by_user_id = user.id if ok else None
    d.verified_at = _now() if ok else None
    d.remark = remark
    db.commit()
    db.refresh(d)
    return d


def delete_document(db: Session, user: User, doc_id: int) -> None:
    d = get_document(db, doc_id, user.school_id)
    key = d.file_key
    db.delete(d)
    db.commit()
    storage.delete(key)


# ---------- assessments ----------


def schedule_assessment(db: Session, user: User, application_id: int, data: AssessmentIn) -> AdmissionAssessment:
    a = get(db, application_id, user.school_id)
    if a.status in (ApplicationStatus.admitted, ApplicationStatus.withdrawn, ApplicationStatus.rejected):
        raise _400("This application is closed")
    if data.assessor_user_id:
        u = db.get(User, data.assessor_user_id)
        if not u or u.school_id != user.school_id or u.role in (UserRole.parent, UserRole.student):
            raise _400("Pick a staff member as the assessor")
    t = AdmissionAssessment(tenant_id=a.tenant_id, school_id=a.school_id, application_id=a.id, **data.model_dump())
    db.add(t)
    if a.status in (ApplicationStatus.submitted, ApplicationStatus.verification):
        _move(db, a, ApplicationStatus.assessment, f"{data.kind.value.replace('_', ' ').capitalize()} scheduled", user.id)
    if data.assessor_user_id:
        notify.staff_users(db, tenant_id=a.tenant_id, school_id=a.school_id, user_ids=[data.assessor_user_id],
                           title=f"Admission {data.kind.value.replace('_', ' ')}: {a.student_name}",
                           body=f"{data.scheduled_at:%d %b %H:%M}" + (f" at {data.venue}" if data.venue else ""))
    db.commit()
    db.refresh(t)
    return t


def record_result(db: Session, user: User, assessment_id: int, data: AssessmentResultIn) -> AdmissionAssessment:
    t = db.get(AdmissionAssessment, assessment_id)
    if not t or t.school_id != user.school_id:
        raise _404("Assessment")
    if data.status == AssessmentStatus.done:
        if data.marks_obtained is not None and t.max_marks is not None and data.marks_obtained > t.max_marks:
            raise _400(f"Marks can't be more than {t.max_marks}")
        if data.passed is None:
            raise _400("Say whether the applicant passed")
    t.status, t.marks_obtained, t.passed, t.remarks = data.status, data.marks_obtained, data.passed, data.remarks
    db.commit()
    db.refresh(t)
    return t


def delete_assessment(db: Session, user: User, assessment_id: int) -> None:
    t = db.get(AdmissionAssessment, assessment_id)
    if not t or t.school_id != user.school_id:
        raise _404("Assessment")
    if t.status == AssessmentStatus.done:
        raise _400("A finished assessment can't be removed")
    db.delete(t)
    db.commit()


def funnel(db: Session, school_id: int, academic_year_id: Optional[int]) -> dict:
    stmt = select(AdmissionApplication.status, func.count()).where(AdmissionApplication.school_id == school_id)
    if academic_year_id:
        stmt = stmt.where(AdmissionApplication.academic_year_id == academic_year_id)
    rows = db.execute(stmt.group_by(AdmissionApplication.status)).all()
    by_status = {s.value: n for s, n in rows}
    return dict(
        by_status=by_status,
        total=sum(by_status.values()),
        in_progress=sum(by_status.get(s.value, 0) for s in OPEN_STATUSES),
        admitted=by_status.get(ApplicationStatus.admitted.value, 0),
        by_source=_by_source(db, school_id, academic_year_id),
    )


def _by_source(db: Session, school_id: int, academic_year_id: Optional[int]) -> list[dict]:
    """Where families heard of the school, carried through the funnel:
    enquiries taken, applications made, places confirmed (admitted) and
    applications still open, per source.

    An application's source is its enquiry's. One made without an enquiry
    (straight from the public form) counts under "direct". Enquiries have no
    academic year, so with a year chosen they are the ones taken between its
    start and end dates."""
    enq = select(AdmissionEnquiry.source, func.count()).where(AdmissionEnquiry.school_id == school_id)
    app = (
        select(AdmissionEnquiry.source, AdmissionApplication.status, func.count())
        .select_from(AdmissionApplication)
        .join(AdmissionEnquiry, AdmissionEnquiry.id == AdmissionApplication.enquiry_id, isouter=True)
        .where(AdmissionApplication.school_id == school_id)
    )
    if academic_year_id:
        year = db.get(AcademicYear, academic_year_id)
        if year:
            enq = enq.where(func.date(AdmissionEnquiry.created_at).between(year.start_date, year.end_date))
        app = app.where(AdmissionApplication.academic_year_id == academic_year_id)
    out: dict[str, dict] = {}

    def row(source) -> dict:
        key = source.value if source is not None else "direct"
        return out.setdefault(key, {"source": key, "enquiries": 0, "applications": 0, "confirmed": 0, "pending": 0})

    for source, n in db.execute(enq.group_by(AdmissionEnquiry.source)).all():
        row(source)["enquiries"] += n
    for source, st, n in db.execute(app.group_by(AdmissionEnquiry.source, AdmissionApplication.status)).all():
        r = row(source)
        r["applications"] += n
        if st == ApplicationStatus.admitted:
            r["confirmed"] += n
        elif st in OPEN_STATUSES:
            r["pending"] += n
    for r in out.values():
        base = r["enquiries"] or r["applications"]
        r["conversion"] = round(r["confirmed"] / base * 100, 1) if base else 0.0
    return sorted(out.values(), key=lambda r: (-r["enquiries"], -r["applications"], r["source"]))
