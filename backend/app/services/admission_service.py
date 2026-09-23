from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import (
    AdmissionActivityKind,
    AdmissionSource,
    AdmissionStage,
    SchoolStatus,
    TenantStatus,
)
from app.models.admission import (
    AdmissionActivity,
    AdmissionCampaign,
    AdmissionEnquiry,
)
from app.models.tenant import School, Tenant
from app.models.user import User
from app.schemas.admission import (
    ActivityCreate,
    CampaignCreate,
    CampaignUpdate,
    ConvertRequest,
    EnquiryCreate,
    EnquiryUpdate,
    PublicEnquiryCreate,
    StageChange,
)
from app.schemas.parent import ParentCreate
from app.schemas.student import StudentCreate


CLOSED_STAGES = (AdmissionStage.enrolled, AdmissionStage.lost)


# --- Campaigns ---

def _get_campaign(db: Session, campaign_id: int, school_id: int) -> AdmissionCampaign:
    c = db.get(AdmissionCampaign, campaign_id)
    if not c or c.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found"
        )
    return c


def campaign_to_read_dict(db: Session, c: AdmissionCampaign) -> dict:
    counts = db.execute(
        select(
            func.count(AdmissionEnquiry.id),
            func.count(AdmissionEnquiry.id).filter(
                AdmissionEnquiry.stage == AdmissionStage.enrolled
            ),
        ).where(AdmissionEnquiry.campaign_id == c.id)
    ).one()
    return {
        "id": c.id,
        "name": c.name,
        "channel": c.channel,
        "start_date": c.start_date,
        "end_date": c.end_date,
        "budget": c.budget,
        "description": c.description,
        "is_active": c.is_active,
        "enquiry_count": counts[0],
        "enrolled_count": counts[1],
        "created_at": c.created_at,
    }


def create_campaign(
    db: Session, tenant_id: int, school_id: int, data: CampaignCreate
) -> AdmissionCampaign:
    c = AdmissionCampaign(
        tenant_id=tenant_id,
        school_id=school_id,
        name=data.name.strip(),
        channel=data.channel,
        start_date=data.start_date,
        end_date=data.end_date,
        budget=data.budget,
        description=data.description,
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def list_campaigns(
    db: Session, school_id: int, *, active_only: bool = False
) -> list[AdmissionCampaign]:
    stmt = (
        select(AdmissionCampaign)
        .where(AdmissionCampaign.school_id == school_id)
        .order_by(AdmissionCampaign.created_at.desc())
    )
    if active_only:
        stmt = stmt.where(AdmissionCampaign.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def update_campaign(
    db: Session, campaign_id: int, school_id: int, data: CampaignUpdate
) -> AdmissionCampaign:
    c = _get_campaign(db, campaign_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    new_start = updates.get("start_date", c.start_date)
    new_end = updates.get("end_date", c.end_date)
    if new_start and new_end and new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date",
        )
    for field, value in updates.items():
        setattr(c, field, value)
    db.commit()
    db.refresh(c)
    return c


def delete_campaign(db: Session, campaign_id: int, school_id: int) -> None:
    c = _get_campaign(db, campaign_id, school_id)
    db.delete(c)  # enquiries keep their data; campaign_id is SET NULL
    db.commit()


# --- Enquiries ---

def _get_enquiry(db: Session, enquiry_id: int, school_id: int) -> AdmissionEnquiry:
    e = db.get(AdmissionEnquiry, enquiry_id)
    if not e or e.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found"
        )
    return e


def _check_assignee(db: Session, user_id: Optional[int], school_id: int) -> None:
    if user_id is None:
        return
    u = db.get(User, user_id)
    if not u or u.school_id != school_id or not u.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user must be an active user of this school",
        )


def _check_branch(db: Session, branch_id: Optional[int], school_id: int) -> None:
    if branch_id is None:
        return
    from app.models.rbac import Branch

    b = db.get(Branch, branch_id)
    if not b or b.school_id != school_id or not b.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch not found")


def list_branches(db: Session, school_id: int) -> list[dict]:
    from app.models.rbac import Branch

    rows = db.execute(
        select(Branch).where(Branch.school_id == school_id, Branch.is_active.is_(True))
        .order_by(Branch.is_main.desc(), Branch.name)
    ).scalars()
    return [{"id": b.id, "name": b.name, "code": b.code, "is_main": b.is_main} for b in rows]


def seats(db: Session, school_id: int, academic_year_id: int) -> list[dict]:
    """Capacity against children placed, per class and section, for one year."""
    from app.models.academic import SchoolClass, Section
    from app.models.student import Student

    classes = list(db.execute(
        select(SchoolClass).where(SchoolClass.school_id == school_id, SchoolClass.academic_year_id == academic_year_id)
        .order_by(SchoolClass.display_order, SchoolClass.name)
    ).scalars())
    sections = list(db.execute(
        select(Section).where(Section.class_id.in_([c.id for c in classes] or [-1])).order_by(Section.name)
    ).scalars())
    taken = dict(db.execute(
        select(Student.section_id, func.count()).where(
            Student.school_id == school_id, Student.academic_year_id == academic_year_id,
            Student.is_active.is_(True), Student.section_id.in_([s.id for s in sections] or [-1]),
        ).group_by(Student.section_id)
    ).all())
    out = []
    for c in classes:
        rows = []
        for s in (x for x in sections if x.class_id == c.id):
            t = int(taken.get(s.id, 0))
            rows.append({"section_id": s.id, "name": s.name, "capacity": s.capacity, "taken": t,
                         "available": max(s.capacity - t, 0) if s.capacity else None})
        cap = sum(r["capacity"] for r in rows)
        tk = sum(r["taken"] for r in rows)
        out.append({"class_id": c.id, "class_name": c.name, "capacity": cap, "taken": tk,
                    "available": max(cap - tk, 0) if cap else None, "sections": rows})
    return out


def enquiry_to_read_dict(db: Session, e: AdmissionEnquiry) -> dict:
    campaign_name = None
    if e.campaign_id:
        c = db.get(AdmissionCampaign, e.campaign_id)
        campaign_name = c.name if c else None
    branch_name = None
    if e.branch_id:
        from app.models.rbac import Branch

        b = db.get(Branch, e.branch_id)
        branch_name = b.name if b else None
    assigned_name = None
    if e.assigned_to_user_id:
        u = db.get(User, e.assigned_to_user_id)
        assigned_name = u.full_name if u else None
    return {
        "id": e.id,
        "student_name": e.student_name,
        "dob": e.dob,
        "gender": e.gender,
        "applying_for_class": e.applying_for_class,
        "previous_school": e.previous_school,
        "parent_name": e.parent_name,
        "parent_phone": e.parent_phone,
        "parent_email": e.parent_email,
        "address": e.address,
        "source": e.source,
        "campaign_id": e.campaign_id,
        "campaign_name": campaign_name,
        "branch_id": e.branch_id,
        "branch_name": branch_name,
        "stage": e.stage,
        "assigned_to_user_id": e.assigned_to_user_id,
        "assigned_to_name": assigned_name,
        "next_follow_up_date": e.next_follow_up_date,
        "lost_reason": e.lost_reason,
        "notes": e.notes,
        "student_id": e.student_id,
        "converted_at": e.converted_at,
        "created_at": e.created_at,
    }


def enquiry_to_detail_dict(db: Session, e: AdmissionEnquiry) -> dict:
    rows = db.execute(
        select(AdmissionActivity, User.full_name)
        .outerjoin(User, AdmissionActivity.user_id == User.id)
        .where(AdmissionActivity.enquiry_id == e.id)
        .order_by(AdmissionActivity.created_at.desc(), AdmissionActivity.id.desc())
    ).all()
    d = enquiry_to_read_dict(db, e)
    d["activities"] = [
        {
            "id": a.id,
            "kind": a.kind,
            "note": a.note,
            "from_stage": a.from_stage,
            "to_stage": a.to_stage,
            "user_id": a.user_id,
            "user_name": name,
            "created_at": a.created_at,
        }
        for a, name in rows
    ]
    return d


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


def create_enquiry(
    db: Session,
    tenant_id: int,
    school_id: int,
    data: EnquiryCreate,
    *,
    actor_user_id: Optional[int] = None,
) -> AdmissionEnquiry:
    if data.campaign_id is not None:
        _get_campaign(db, data.campaign_id, school_id)
    _check_assignee(db, data.assigned_to_user_id, school_id)
    _check_branch(db, data.branch_id, school_id)

    e = AdmissionEnquiry(
        tenant_id=tenant_id,
        school_id=school_id,
        student_name=data.student_name.strip(),
        dob=data.dob,
        gender=data.gender,
        applying_for_class=_clean(data.applying_for_class),
        previous_school=_clean(data.previous_school),
        parent_name=data.parent_name.strip(),
        parent_phone=data.parent_phone.strip(),
        parent_email=_clean(data.parent_email),
        address=_clean(data.address),
        source=data.source,
        campaign_id=data.campaign_id,
        branch_id=data.branch_id,
        stage=AdmissionStage.enquiry,
        assigned_to_user_id=data.assigned_to_user_id,
        next_follow_up_date=data.next_follow_up_date,
        notes=_clean(data.notes),
    )
    db.add(e)
    db.flush()
    db.add(
        AdmissionActivity(
            enquiry_id=e.id,
            user_id=actor_user_id,
            kind=AdmissionActivityKind.stage_change,
            note="Enquiry created",
            to_stage=AdmissionStage.enquiry,
        )
    )
    db.commit()
    db.refresh(e)
    return e


def list_enquiries(
    db: Session,
    school_id: int,
    *,
    stage: Optional[AdmissionStage] = None,
    source: Optional[AdmissionSource] = None,
    campaign_id: Optional[int] = None,
    assigned_to_user_id: Optional[int] = None,
    open_only: bool = False,
    follow_up_due: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[AdmissionEnquiry], int]:
    stmt = select(AdmissionEnquiry).where(AdmissionEnquiry.school_id == school_id)
    if stage:
        stmt = stmt.where(AdmissionEnquiry.stage == stage)
    if source:
        stmt = stmt.where(AdmissionEnquiry.source == source)
    if campaign_id:
        stmt = stmt.where(AdmissionEnquiry.campaign_id == campaign_id)
    if assigned_to_user_id:
        stmt = stmt.where(AdmissionEnquiry.assigned_to_user_id == assigned_to_user_id)
    if open_only or follow_up_due:
        stmt = stmt.where(AdmissionEnquiry.stage.not_in(CLOSED_STAGES))
    if follow_up_due:
        stmt = stmt.where(AdmissionEnquiry.next_follow_up_date <= date.today())
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AdmissionEnquiry.student_name.ilike(like),
                AdmissionEnquiry.parent_name.ilike(like),
                AdmissionEnquiry.parent_phone.ilike(like),
                AdmissionEnquiry.parent_email.ilike(like),
            )
        )

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    order = (
        [AdmissionEnquiry.next_follow_up_date.asc().nulls_last()]
        if follow_up_due
        else [AdmissionEnquiry.created_at.desc()]
    )
    items = (
        db.execute(
            stmt.order_by(*order, AdmissionEnquiry.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(items), total


def get_enquiry(db: Session, enquiry_id: int, school_id: int) -> AdmissionEnquiry:
    return _get_enquiry(db, enquiry_id, school_id)


def update_enquiry(
    db: Session, enquiry_id: int, school_id: int, data: EnquiryUpdate
) -> AdmissionEnquiry:
    e = _get_enquiry(db, enquiry_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("campaign_id") is not None:
        _get_campaign(db, updates["campaign_id"], school_id)
    if "assigned_to_user_id" in updates:
        _check_assignee(db, updates["assigned_to_user_id"], school_id)
    if updates.get("branch_id") is not None:
        _check_branch(db, updates["branch_id"], school_id)
    for field in ("applying_for_class", "previous_school", "parent_email", "address", "notes"):
        if field in updates:
            updates[field] = _clean(updates[field])
    for field in ("student_name", "parent_name", "parent_phone"):
        if updates.get(field):
            updates[field] = updates[field].strip()
    for field, value in updates.items():
        setattr(e, field, value)
    db.commit()
    db.refresh(e)
    return e


def delete_enquiry(db: Session, enquiry_id: int, school_id: int) -> None:
    e = _get_enquiry(db, enquiry_id, school_id)
    if e.stage == AdmissionStage.enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enrolled enquiries can't be deleted; they're the admission record",
        )
    db.delete(e)
    db.commit()


def add_activity(
    db: Session,
    enquiry_id: int,
    school_id: int,
    actor_user_id: int,
    data: ActivityCreate,
) -> AdmissionEnquiry:
    e = _get_enquiry(db, enquiry_id, school_id)
    if data.kind == AdmissionActivityKind.stage_change:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use the stage endpoint to change stage",
        )
    db.add(
        AdmissionActivity(
            enquiry_id=e.id,
            user_id=actor_user_id,
            kind=data.kind,
            note=data.note.strip(),
        )
    )
    if "next_follow_up_date" in data.model_fields_set:
        e.next_follow_up_date = data.next_follow_up_date
    # Logging a real conversation moves a fresh enquiry forward automatically.
    if e.stage == AdmissionStage.enquiry and data.kind != AdmissionActivityKind.note:
        db.add(
            AdmissionActivity(
                enquiry_id=e.id,
                user_id=actor_user_id,
                kind=AdmissionActivityKind.stage_change,
                from_stage=e.stage,
                to_stage=AdmissionStage.contacted,
            )
        )
        e.stage = AdmissionStage.contacted
    db.commit()
    db.refresh(e)
    return e


def change_stage(
    db: Session,
    enquiry_id: int,
    school_id: int,
    actor_user_id: int,
    data: StageChange,
) -> AdmissionEnquiry:
    e = _get_enquiry(db, enquiry_id, school_id)
    if e.stage == AdmissionStage.enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enquiry is already enrolled",
        )
    if e.stage == data.stage:
        return e
    db.add(
        AdmissionActivity(
            enquiry_id=e.id,
            user_id=actor_user_id,
            kind=AdmissionActivityKind.stage_change,
            note=_clean(data.note),
            from_stage=e.stage,
            to_stage=data.stage,
        )
    )
    e.stage = data.stage
    if data.stage == AdmissionStage.lost:
        e.lost_reason = data.lost_reason.strip()
        e.next_follow_up_date = None
    else:
        e.lost_reason = None
    db.commit()
    db.refresh(e)
    return e


def convert(
    db: Session,
    tenant_id: int,
    school_id: int,
    enquiry_id: int,
    actor_user_id: int,
    data: ConvertRequest,
) -> dict:
    """Enrol the enquiry: create the Student (with one-time fees, via the
    normal student flow) and optionally a parent login linked to it."""
    from app.services import parent_service, student_service  # avoid cycles

    e = _get_enquiry(db, enquiry_id, school_id)
    if e.stage == AdmissionStage.enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enquiry is already enrolled",
        )
    if e.stage == AdmissionStage.lost:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reopen the enquiry before enrolling it",
        )

    student = student_service.create_student(
        db,
        tenant_id,
        school_id,
        StudentCreate(
            full_name=e.student_name,
            dob=e.dob,
            gender=e.gender,
            address=e.address,
            admission_no=data.admission_no,
            academic_year_id=data.academic_year_id,
            section_id=data.section_id,
        ),
    )

    result: dict = {
        "enquiry_id": e.id,
        "student_id": student.id,
        "admission_no": student.admission_no,
        "parent_user_id": None,
        "parent_temporary_password": None,
        "parent_login_note": None,
    }

    if data.create_parent_login:
        if not e.parent_email:
            result["parent_login_note"] = (
                "No parent email on the enquiry, so no parent login was created. "
                "Add one from the Parents page."
            )
        else:
            try:
                parent, password = parent_service.create_parent(
                    db,
                    tenant_id,
                    school_id,
                    ParentCreate(
                        full_name=e.parent_name,
                        email=e.parent_email,
                        phone=e.parent_phone,
                        student_id=student.id,
                        relation=data.relation,
                    ),
                )
                result["parent_user_id"] = parent.id
                result["parent_temporary_password"] = password
            except HTTPException as exc:
                # The student is already created; don't fail the whole enrolment
                # because the parent's email is taken. Surface it instead.
                db.rollback()
                result["parent_login_note"] = f"Parent login not created: {exc.detail}"

    e = _get_enquiry(db, enquiry_id, school_id)
    db.add(
        AdmissionActivity(
            enquiry_id=e.id,
            user_id=actor_user_id,
            kind=AdmissionActivityKind.stage_change,
            note=f"Enrolled as {student.admission_no}",
            from_stage=e.stage,
            to_stage=AdmissionStage.enrolled,
        )
    )
    e.stage = AdmissionStage.enrolled
    e.student_id = student.id
    e.converted_at = datetime.now(timezone.utc)
    e.next_follow_up_date = None
    db.commit()
    return result


def stats(db: Session, school_id: int) -> dict:
    by_stage = {
        s.value: c
        for s, c in db.execute(
            select(AdmissionEnquiry.stage, func.count(AdmissionEnquiry.id))
            .where(AdmissionEnquiry.school_id == school_id)
            .group_by(AdmissionEnquiry.stage)
        ).all()
    }
    by_source = {
        s.value: c
        for s, c in db.execute(
            select(AdmissionEnquiry.source, func.count(AdmissionEnquiry.id))
            .where(AdmissionEnquiry.school_id == school_id)
            .group_by(AdmissionEnquiry.source)
        ).all()
    }
    due = db.execute(
        select(func.count(AdmissionEnquiry.id)).where(
            AdmissionEnquiry.school_id == school_id,
            AdmissionEnquiry.stage.not_in(CLOSED_STAGES),
            AdmissionEnquiry.next_follow_up_date <= date.today(),
        )
    ).scalar_one()
    total = sum(by_stage.values())
    enrolled = by_stage.get(AdmissionStage.enrolled.value, 0)
    lost = by_stage.get(AdmissionStage.lost.value, 0)
    closed = enrolled + lost
    return {
        "total": total,
        "by_stage": {s.value: by_stage.get(s.value, 0) for s in AdmissionStage},
        "by_source": by_source,
        "enrolled": enrolled,
        "lost": lost,
        "open": total - closed,
        "conversion_rate": round(enrolled * 100 / closed, 1) if closed else 0.0,
        "follow_ups_due": due,
    }


# --- Public enquiry form ---

def resolve_public_school(db: Session, tenant_code: str, school_code: Optional[str] = None) -> School:
    """The school behind a public link.

    Links carry the organization's code and the school's code
    (/apply/<tenant>/<school>). With only one code — the short link an
    organization with a single school hands out — that school is used; where
    an organization runs several, the code must name one of them.
    """
    if school_code is None:
        rows = list(db.execute(
            select(School)
            .join(Tenant, School.tenant_id == Tenant.id)
            .where(
                func.lower(Tenant.code) == tenant_code.lower(),
                Tenant.status == TenantStatus.active,
                Tenant.is_active.is_(True),
                School.status == SchoolStatus.active,
                School.is_active.is_(True),
            )
        ).scalars())
        if len(rows) == 1:
            return rows[0]
        if not rows:
            # the code may name the school itself
            rows = list(db.execute(
                select(School)
                .join(Tenant, School.tenant_id == Tenant.id)
                .where(
                    func.lower(School.code) == tenant_code.lower(),
                    Tenant.status == TenantStatus.active,
                    Tenant.is_active.is_(True),
                    School.status == SchoolStatus.active,
                    School.is_active.is_(True),
                )
            ).scalars())
            if len(rows) == 1:
                return rows[0]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This organization runs more than one school; use the school's own link." if rows else "School not found",
        )
    return _resolve_pair(db, tenant_code, school_code)


def _resolve_pair(db: Session, tenant_code: str, school_code: str) -> School:
    school = db.execute(
        select(School)
        .join(Tenant, School.tenant_id == Tenant.id)
        .where(
            func.lower(Tenant.code) == tenant_code.lower(),
            func.lower(School.code) == school_code.lower(),
            Tenant.status == TenantStatus.active,
            Tenant.is_active.is_(True),
            School.status == SchoolStatus.active,
            School.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="School not found"
        )
    return school


def public_school_info(school: School) -> dict:
    return {
        "school_name": school.name,
        "logo_url": school.logo_url,
        "brand_color": school.brand_color,
        "address": school.address,
        "phone": school.phone_primary,
        "email": school.email,
    }


def create_public_enquiry(
    db: Session, school: School, data: PublicEnquiryCreate
) -> Optional[AdmissionEnquiry]:
    if data.website:
        return None  # honeypot tripped: pretend success, store nothing
    notes = _clean(data.message)
    return create_enquiry(
        db,
        school.tenant_id,
        school.id,
        EnquiryCreate(
            **data.model_dump(exclude={"message", "website"}),
            source=AdmissionSource.website,
            notes=f"Message from parent: {notes}" if notes else None,
        ),
    )
