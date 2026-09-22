"""Discipline incidents and counselling cases.

Who sees what
  Discipline: school admin and principal see everything. A teacher sees
    incidents they reported or that involve a student in the section they are
    class teacher of. Parents see only incidents the school shares.
  Counselling: the assigned counsellor, the principal and the school admin.
    The referring teacher can see their own referrals unless the case is
    marked sensitive. Parents never see case notes."""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import (
    CaseStatus,
    DisciplineActionKind,
    IncidentStatus,
    UserRole,
)
from app.core.scoping import get_school_student, require_linked_child, school_today, section_labels
from app.models.academic import Section
from app.models.pastoral import CounsellingCase, CounsellingSession, DisciplineAction, DisciplineIncident
from app.models.student import Student
from app.models.user import User
from app.schemas.pastoral import (
    ActionIn,
    CaseIn,
    CaseUpdate,
    IncidentIn,
    IncidentUpdate,
    SessionIn,
)

OFFICE = (UserRole.school_admin, UserRole.principal)


def is_office(db: Session, user: User, permission: str = "discipline.manage") -> bool:
    """Office roles, or someone a school has given the permission to."""
    if user.role in OFFICE:
        return True
    from app.services import rbac_service

    return rbac_service.has_permission(db, user, permission)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _403(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


def _next_ref(db: Session, school_id: int, model, prefix: str) -> str:
    """DIS-2609-0007 style: prefix, year+month, running number for the school."""
    today = school_today(db, school_id)
    stamp = f"{today:%y%m}"
    like = f"{prefix}-{stamp}-%"
    n = db.execute(
        select(func.count()).select_from(model).where(model.school_id == school_id, model.reference_no.like(like))
    ).scalar_one()
    return f"{prefix}-{stamp}-{n + 1:04d}"


def _my_sections(db: Session, user: User) -> set[int]:
    return set(db.execute(select(Section.id).where(Section.class_teacher_user_id == user.id)).scalars())


# ---------- discipline ----------


def get_incident(db: Session, user: User, incident_id: int) -> DisciplineIncident:
    i = db.get(DisciplineIncident, incident_id)
    if not i or i.school_id != user.school_id or not can_see_incident(db, user, i):
        raise _404("Incident")
    return i


def can_see_incident(db: Session, user: User, i: DisciplineIncident) -> bool:
    if is_office(db, user):
        return True
    return i.reported_by_user_id == user.id or i.section_id in _my_sections(db, user)


def can_edit_incident(user: User, i: DisciplineIncident) -> bool:
    if user.role in OFFICE:
        return True
    # the reporter can correct their own report until the office picks it up
    return i.reported_by_user_id == user.id and i.status == IncidentStatus.reported


def create_incident(db: Session, user: User, data: IncidentIn) -> DisciplineIncident:
    st = get_school_student(db, data.student_id, user.school_id)
    if data.occurred_on > school_today(db, user.school_id):
        raise _400("The incident can't be in the future")
    i = DisciplineIncident(
        tenant_id=user.tenant_id, school_id=user.school_id, student_id=st.id, section_id=st.section_id,
        reference_no=_next_ref(db, user.school_id, DisciplineIncident, "DIS"),
        reported_by_user_id=user.id, **data.model_dump(exclude={"student_id"}),
    )
    db.add(i)
    db.flush()
    if user.role not in OFFICE:
        admins = list(db.execute(
            select(User.id).where(User.school_id == user.school_id, User.role.in_(OFFICE), User.is_active.is_(True))
        ).scalars())
        notify.staff_users(db, tenant_id=i.tenant_id, school_id=i.school_id, user_ids=admins,
                           title=f"Discipline: {st.full_name}",
                           body=f"{user.full_name} reported a {i.severity.value} incident on {i.occurred_on:%d %b}. {i.description[:200]}")
    db.commit()
    db.refresh(i)
    return i


def update_incident(db: Session, user: User, incident_id: int, data: IncidentUpdate) -> DisciplineIncident:
    i = get_incident(db, user, incident_id)
    if not can_edit_incident(user, i):
        raise _403("Only the office can change an incident once it's being looked into")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("status") in (IncidentStatus.closed, IncidentStatus.dismissed) and i.status != updates["status"]:
        i.closed_on, i.closed_by_user_id = school_today(db, i.school_id), user.id
    for k, v in updates.items():
        setattr(i, k, v)
    if i.status not in (IncidentStatus.closed, IncidentStatus.dismissed):
        i.closed_on = i.closed_by_user_id = None
    db.commit()
    db.refresh(i)
    return i


def delete_incident(db: Session, user: User, incident_id: int) -> None:
    i = get_incident(db, user, incident_id)
    if user.role not in OFFICE:
        raise _403("Only the office can delete an incident")
    if db.execute(select(DisciplineAction.id).where(DisciplineAction.incident_id == i.id).limit(1)).first():
        raise _400("Remove the actions on this incident first")
    db.delete(i)
    db.commit()


def share_with_parents(db: Session, user: User, incident_id: int, note: Optional[str]) -> DisciplineIncident:
    i = get_incident(db, user, incident_id)
    if not is_office(db, user, "discipline.share"):
        raise _403("Only the office can share an incident with parents")
    st = db.get(Student, i.student_id)
    i.shared_with_parents = True
    i.parent_informed_at = datetime.now(timezone.utc)
    notify.student_parents(
        db, st, f"School incident: {st.full_name}",
        (note or f"An incident on {i.occurred_on:%d %b %Y} has been recorded. Please see the parent app for details."),
    )
    db.commit()
    db.refresh(i)
    return i


def add_action(db: Session, user: User, incident_id: int, data: ActionIn) -> DisciplineAction:
    i = get_incident(db, user, incident_id)
    if not is_office(db, user):
        raise _403("Only the office can record an action")
    if data.end_date and data.start_date and data.end_date < data.start_date:
        raise _400("The action ends before it starts")
    a = DisciplineAction(tenant_id=i.tenant_id, school_id=i.school_id, incident_id=i.id,
                         assigned_by_user_id=user.id, **data.model_dump(exclude={"open_counselling_case", "notify_parents"}))
    db.add(a)
    if i.status in (IncidentStatus.reported, IncidentStatus.investigating):
        i.status = IncidentStatus.action_taken
    if data.open_counselling_case or data.kind == DisciplineActionKind.counselling_referral:
        st = db.get(Student, i.student_id)
        case = CounsellingCase(
            tenant_id=i.tenant_id, school_id=i.school_id, student_id=st.id,
            reference_no=_next_ref(db, i.school_id, CounsellingCase, "CNS"),
            title=f"Referral from incident {i.reference_no}",
            category="behaviour", concern=data.details or i.description,
            opened_on=school_today(db, i.school_id), referred_by_user_id=user.id,
        )
        db.add(case)
        db.flush()
        a.counselling_case_id = case.id
    if data.notify_parents:
        st = db.get(Student, i.student_id)
        notify.student_parents(db, st, f"Action recorded: {st.full_name}",
                               f"{data.kind.value.replace('_', ' ').capitalize()}. {data.details or ''}".strip())
        i.shared_with_parents = True
        i.parent_informed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return a


def delete_action(db: Session, user: User, action_id: int) -> None:
    a = db.get(DisciplineAction, action_id)
    if not a or a.school_id != user.school_id:
        raise _404("Action")
    if user.role not in OFFICE:
        raise _403("Only the office can remove an action")
    db.delete(a)
    db.commit()


def list_incidents(db: Session, user: User, *, student_id: Optional[int], status_: Optional[IncidentStatus],
                   frm: Optional[date], to: Optional[date], section_id: Optional[int]) -> list[DisciplineIncident]:
    stmt = select(DisciplineIncident).where(DisciplineIncident.school_id == user.school_id)
    if user.role not in OFFICE:
        mine = _my_sections(db, user)
        stmt = stmt.where(or_(
            DisciplineIncident.reported_by_user_id == user.id,
            DisciplineIncident.section_id.in_(mine or {-1}),
        ))
    if student_id:
        stmt = stmt.where(DisciplineIncident.student_id == student_id)
    if status_:
        stmt = stmt.where(DisciplineIncident.status == status_)
    if section_id:
        stmt = stmt.where(DisciplineIncident.section_id == section_id)
    if frm:
        stmt = stmt.where(DisciplineIncident.occurred_on >= frm)
    if to:
        stmt = stmt.where(DisciplineIncident.occurred_on <= to)
    return list(db.execute(stmt.order_by(DisciplineIncident.occurred_on.desc(), DisciplineIncident.id.desc()).limit(500)).scalars())


def incidents_to_read(db: Session, user: Optional[User], items: list[DisciplineIncident]) -> list[dict]:
    if not items:
        return []
    students = {s.id: s for s in db.execute(select(Student).where(Student.id.in_({i.student_id for i in items}))).scalars()}
    labels = section_labels(db, {i.section_id for i in items if i.section_id})
    users = _names(db, {i.reported_by_user_id for i in items} | {i.closed_by_user_id for i in items})
    actions: dict[int, list] = {}
    for a in db.execute(select(DisciplineAction).where(DisciplineAction.incident_id.in_([i.id for i in items]))).scalars():
        actions.setdefault(a.incident_id, []).append(a)
    assigners = _names(db, {a.assigned_by_user_id for v in actions.values() for a in v})
    out = []
    for i in items:
        st = students.get(i.student_id)
        out.append(dict(
            id=i.id, reference_no=i.reference_no, student_id=i.student_id, student_name=st.full_name if st else "",
            admission_no=st.admission_no if st else None, section_id=i.section_id,
            section_label=labels.get(i.section_id), occurred_on=i.occurred_on, place=i.place, category=i.category,
            severity=i.severity, description=i.description, witnesses=i.witnesses, status=i.status,
            reported_by_name=users.get(i.reported_by_user_id), resolution=i.resolution, closed_on=i.closed_on,
            closed_by_name=users.get(i.closed_by_user_id), shared_with_parents=i.shared_with_parents,
            parent_informed_at=i.parent_informed_at,
            can_edit=bool(user) and can_edit_incident(user, i),
            is_office=bool(user) and user.role in OFFICE,
            actions=[
                dict(id=a.id, kind=a.kind, details=a.details, start_date=a.start_date, end_date=a.end_date,
                     assigned_by_name=assigners.get(a.assigned_by_user_id), completed_on=a.completed_on,
                     counselling_case_id=a.counselling_case_id)
                for a in sorted(actions.get(i.id, []), key=lambda a: a.id)
            ],
        ))
    return out


def child_incidents(db: Session, parent_user_id: int, student_id: int) -> list[dict]:
    st = require_linked_child(db, parent_user_id, student_id)
    items = list(db.execute(
        select(DisciplineIncident).where(
            DisciplineIncident.student_id == st.id, DisciplineIncident.shared_with_parents.is_(True)
        ).order_by(DisciplineIncident.occurred_on.desc())
    ).scalars())
    rows = incidents_to_read(db, None, items)
    for r in rows:  # parents don't need internal notes
        r.pop("witnesses", None)
        r["can_edit"] = False
    return rows


def discipline_summary(db: Session, user: User, frm: date, to: date) -> dict:
    if user.role not in OFFICE:
        raise _403("Office access required")
    rows = list_incidents(db, user, student_id=None, status_=None, frm=frm, to=to, section_id=None)
    by_cat: dict[str, int] = {}
    by_sev: dict[str, int] = {}
    by_section: dict[str, int] = {}
    repeat: dict[int, int] = {}
    labels = section_labels(db, {i.section_id for i in rows if i.section_id})
    for i in rows:
        by_cat[i.category.value] = by_cat.get(i.category.value, 0) + 1
        by_sev[i.severity.value] = by_sev.get(i.severity.value, 0) + 1
        key = labels.get(i.section_id, "—")
        by_section[key] = by_section.get(key, 0) + 1
        repeat[i.student_id] = repeat.get(i.student_id, 0) + 1
    names = {s.id: s.full_name for s in db.execute(
        select(Student).where(Student.id.in_([s for s, n in repeat.items() if n > 1] or [-1]))
    ).scalars()}
    return dict(
        from_date=frm, to_date=to, total=len(rows), open=sum(1 for i in rows if i.status not in (IncidentStatus.closed, IncidentStatus.dismissed)),
        by_category=by_cat, by_severity=by_sev, by_section=by_section,
        repeat_students=sorted(
            [dict(student_id=s, student_name=names.get(s, ""), incidents=n) for s, n in repeat.items() if n > 1],
            key=lambda r: -r["incidents"],
        ),
    )


# ---------- counselling ----------


def can_see_case(db: Session, user: User, c: CounsellingCase) -> bool:
    if user.role in OFFICE or _may_counsel(db, user):
        return True
    if c.counsellor_user_id == user.id:
        return True
    return c.referred_by_user_id == user.id and not c.is_sensitive


def _may_counsel(db: Session, user: User) -> bool:
    from app.services import rbac_service

    return rbac_service.has_permission(db, user, "counselling.access")


def can_write_case(db: Session, user: User, c: CounsellingCase) -> bool:
    return user.role in OFFICE or c.counsellor_user_id == user.id or _may_counsel(db, user)


def get_case(db: Session, user: User, case_id: int) -> CounsellingCase:
    c = db.get(CounsellingCase, case_id)
    if not c or c.school_id != user.school_id or not can_see_case(db, user, c):
        raise _404("Case")
    return c


def create_case(db: Session, user: User, data: CaseIn) -> CounsellingCase:
    st = get_school_student(db, data.student_id, user.school_id)
    if data.counsellor_user_id:
        _check_counsellor(db, user.school_id, data.counsellor_user_id)
    c = CounsellingCase(
        tenant_id=user.tenant_id, school_id=user.school_id, student_id=st.id,
        reference_no=_next_ref(db, user.school_id, CounsellingCase, "CNS"),
        opened_on=school_today(db, user.school_id), referred_by_user_id=user.id,
        **data.model_dump(exclude={"student_id"}),
    )
    db.add(c)
    db.flush()
    if c.counsellor_user_id and c.counsellor_user_id != user.id:
        notify.staff_users(db, tenant_id=c.tenant_id, school_id=c.school_id, user_ids=[c.counsellor_user_id],
                           title=f"Counselling case {c.reference_no}",
                           body=f"{st.full_name} — {c.title} ({c.priority.value} priority).")
    db.commit()
    db.refresh(c)
    return c


def _check_counsellor(db: Session, school_id: int, user_id: int) -> None:
    u = db.get(User, user_id)
    if not u or u.school_id != school_id or u.role in (UserRole.parent, UserRole.student) or not u.is_active:
        raise _400("Pick an active staff member as the counsellor")


def update_case(db: Session, user: User, case_id: int, data: CaseUpdate) -> CounsellingCase:
    c = get_case(db, user, case_id)
    if not can_write_case(db, user, c):
        raise _403("Only the assigned counsellor or the office can change this case")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("counsellor_user_id"):
        _check_counsellor(db, c.school_id, updates["counsellor_user_id"])
    if updates.get("status") == CaseStatus.closed and c.status != CaseStatus.closed:
        if not (updates.get("outcome") or c.outcome):
            raise _400("Write the outcome before closing a case")
        c.closed_on = school_today(db, c.school_id)
    for k, v in updates.items():
        setattr(c, k, v)
    if c.status != CaseStatus.closed:
        c.closed_on = None
    db.commit()
    db.refresh(c)
    return c


def add_session(db: Session, user: User, case_id: int, data: SessionIn) -> CounsellingSession:
    c = get_case(db, user, case_id)
    if not can_write_case(db, user, c):
        raise _403("Only the assigned counsellor or the office can add notes")
    if c.status == CaseStatus.closed:
        raise _400("This case is closed; reopen it to add notes")
    if data.met_on > school_today(db, c.school_id):
        raise _400("The session can't be in the future")
    s = CounsellingSession(tenant_id=c.tenant_id, school_id=c.school_id, case_id=c.id,
                           recorded_by_user_id=user.id, **data.model_dump())
    db.add(s)
    if c.status == CaseStatus.open:
        c.status = CaseStatus.in_progress
    db.commit()
    db.refresh(s)
    return s


def list_cases(db: Session, user: User, *, student_id: Optional[int], status_: Optional[CaseStatus],
               counsellor_user_id: Optional[int]) -> list[CounsellingCase]:
    stmt = select(CounsellingCase).where(CounsellingCase.school_id == user.school_id)
    if user.role not in OFFICE:
        stmt = stmt.where(or_(
            CounsellingCase.counsellor_user_id == user.id,
            (CounsellingCase.referred_by_user_id == user.id) & (CounsellingCase.is_sensitive.is_(False)),
        ))
    if student_id:
        stmt = stmt.where(CounsellingCase.student_id == student_id)
    if status_:
        stmt = stmt.where(CounsellingCase.status == status_)
    if counsellor_user_id:
        stmt = stmt.where(CounsellingCase.counsellor_user_id == counsellor_user_id)
    return list(db.execute(stmt.order_by(CounsellingCase.opened_on.desc(), CounsellingCase.id.desc()).limit(500)).scalars())


def cases_to_read(db: Session, user: User, items: list[CounsellingCase], with_sessions: bool = False) -> list[dict]:
    if not items:
        return []
    students = {s.id: s for s in db.execute(select(Student).where(Student.id.in_({c.student_id for c in items}))).scalars()}
    labels = section_labels(db, {s.section_id for s in students.values()})
    users = _names(db, {c.counsellor_user_id for c in items} | {c.referred_by_user_id for c in items})
    counts = dict(db.execute(
        select(CounsellingSession.case_id, func.count())
        .where(CounsellingSession.case_id.in_([c.id for c in items])).group_by(CounsellingSession.case_id)
    ).all())
    sessions: dict[int, list] = {}
    if with_sessions:
        rows = list(db.execute(
            select(CounsellingSession).where(CounsellingSession.case_id.in_([c.id for c in items]))
            .order_by(CounsellingSession.met_on.desc(), CounsellingSession.id.desc())
        ).scalars())
        recorders = _names(db, {s.recorded_by_user_id for s in rows})
        for s in rows:
            sessions.setdefault(s.case_id, []).append(dict(
                id=s.id, met_on=s.met_on, minutes=s.minutes, attendees=s.attendees, notes=s.notes,
                support_plan=s.support_plan, next_session_on=s.next_session_on, recorded_by_name=recorders.get(s.recorded_by_user_id),
            ))
    out = []
    for c in items:
        st = students.get(c.student_id)
        out.append(dict(
            id=c.id, reference_no=c.reference_no, student_id=c.student_id, student_name=st.full_name if st else "",
            section_label=labels.get(st.section_id) if st else None, title=c.title, category=c.category,
            concern=c.concern, priority=c.priority, status=c.status, is_sensitive=c.is_sensitive,
            opened_on=c.opened_on, referred_by_name=users.get(c.referred_by_user_id),
            counsellor_user_id=c.counsellor_user_id, counsellor_name=users.get(c.counsellor_user_id),
            parent_informed=c.parent_informed, referred_to=c.referred_to, outcome=c.outcome, closed_on=c.closed_on,
            session_count=counts.get(c.id, 0), can_write=can_write_case(db, user, c),
            sessions=sessions.get(c.id, []),
        ))
    return out


def case_detail(db: Session, user: User, case_id: int) -> dict:
    c = get_case(db, user, case_id)
    return cases_to_read(db, user, [c], with_sessions=True)[0]


def inform_parents(db: Session, user: User, case_id: int, message: str) -> CounsellingCase:
    """Tell the parents the school would like to meet — never the case notes."""
    c = get_case(db, user, case_id)
    if not can_write_case(db, user, c):
        raise _403("Only the assigned counsellor or the office can contact parents")
    st = db.get(Student, c.student_id)
    notify.student_parents(db, st, f"From the school counsellor: {st.full_name}", message)
    c.parent_informed = True
    db.commit()
    db.refresh(c)
    return c
