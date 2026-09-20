"""Grade scales, exam types, result approval and report card settings.

A school defines one or more grade scales (bands of percentage -> grade, grade
points, pass/fail). One is the default; an exam can pin another. Marks and
report cards use the exam's scale, falling back to the built-in bands when a
school hasn't set any up."""
from decimal import ROUND_HALF_UP, Decimal
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.models.academic import Section
from app.models.exam import Exam
from app.models.grading import ExamType, GradeBand, GradeScale, ReportCardRemark, ReportCardSetting
from app.models.student import Student
from app.models.user import User
from app.schemas.exam import grade_for_percent
from app.schemas.grading import ExamTypeIn, GradeScaleIn, RemarkIn, ReportCardSettingIn


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# ---------- grade scales ----------


def get_scale(db: Session, scale_id: int, school_id: int) -> GradeScale:
    s = db.get(GradeScale, scale_id)
    if not s or s.school_id != school_id:
        raise _404("Grade scale")
    return s


def list_scales(db: Session, school_id: int) -> list[GradeScale]:
    return list(db.execute(
        select(GradeScale).where(GradeScale.school_id == school_id).order_by(GradeScale.name)
    ).scalars())


def _apply_bands(db: Session, scale: GradeScale, data: GradeScaleIn) -> None:
    scale.bands.clear()
    db.flush()
    for b in sorted(data.bands, key=lambda x: x.min_percent, reverse=True):
        scale.bands.append(GradeBand(tenant_id=scale.tenant_id, school_id=scale.school_id, **b.model_dump()))


def _clear_default(db: Session, school_id: int, keep_id: Optional[int]) -> None:
    for s in db.execute(select(GradeScale).where(GradeScale.school_id == school_id, GradeScale.is_default.is_(True))).scalars():
        if s.id != keep_id:
            s.is_default = False


def _name_taken(db: Session, school_id: int, name: str, except_id: Optional[int] = None) -> bool:
    stmt = select(GradeScale.id).where(GradeScale.school_id == school_id, func.lower(GradeScale.name) == name.strip().lower())
    if except_id:
        stmt = stmt.where(GradeScale.id != except_id)
    return db.execute(stmt.limit(1)).first() is not None


def create_scale(db: Session, user: User, data: GradeScaleIn) -> GradeScale:
    if _name_taken(db, user.school_id, data.name):
        raise _400("A grade scale with that name already exists")
    first = not list_scales(db, user.school_id)
    s = GradeScale(tenant_id=user.tenant_id, school_id=user.school_id, name=data.name,
                   description=data.description, is_active=data.is_active, is_default=data.is_default or first)
    db.add(s)
    db.flush()
    _apply_bands(db, s, data)
    if s.is_default:
        _clear_default(db, user.school_id, s.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("A grade scale with that name already exists")
    db.refresh(s)
    return s


def update_scale(db: Session, user: User, scale_id: int, data: GradeScaleIn) -> GradeScale:
    s = get_scale(db, scale_id, user.school_id)
    if _name_taken(db, user.school_id, data.name, except_id=s.id):
        raise _400("A grade scale with that name already exists")
    s.name, s.description, s.is_active = data.name, data.description, data.is_active
    _apply_bands(db, s, data)
    if data.is_default:
        s.is_default = True
        _clear_default(db, user.school_id, s.id)
    elif s.is_default and not data.is_default:
        raise _400("Make another scale the default instead of unsetting this one")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("A grade scale with that name already exists")
    db.refresh(s)
    return s


def set_default(db: Session, user: User, scale_id: int) -> GradeScale:
    s = get_scale(db, scale_id, user.school_id)
    if not s.is_active:
        raise _400("Activate the scale before making it the default")
    s.is_default = True
    _clear_default(db, user.school_id, s.id)
    db.commit()
    db.refresh(s)
    return s


def delete_scale(db: Session, user: User, scale_id: int) -> None:
    s = get_scale(db, scale_id, user.school_id)
    if s.is_default:
        raise _400("The default scale can't be deleted")
    used = db.execute(select(Exam.id).where(Exam.grade_scale_id == s.id).limit(1)).first()
    if used:
        raise _400("An exam uses this scale; deactivate it instead")
    db.delete(s)
    db.commit()


def scale_to_read(db: Session, s: GradeScale) -> dict:
    used = db.execute(select(func.count()).select_from(Exam).where(Exam.grade_scale_id == s.id)).scalar_one()
    return dict(
        id=s.id, name=s.name, description=s.description, is_default=s.is_default, is_active=s.is_active,
        used_by_exams=used,
        bands=[dict(grade=b.grade, min_percent=b.min_percent, max_percent=b.max_percent, points=b.points,
                    remark=b.remark, is_pass=b.is_pass) for b in sorted(s.bands, key=lambda b: b.min_percent, reverse=True)],
    )


def default_scale(db: Session, school_id: int) -> Optional[GradeScale]:
    return db.execute(
        select(GradeScale).where(GradeScale.school_id == school_id, GradeScale.is_default.is_(True),
                                 GradeScale.is_active.is_(True)).limit(1)
    ).scalar_one_or_none()


def scale_for_exam(db: Session, exam: Exam) -> Optional[GradeScale]:
    if exam.grade_scale_id:
        s = db.get(GradeScale, exam.grade_scale_id)
        if s and s.is_active:
            return s
    return default_scale(db, exam.school_id)


def grade_for(scale: Optional[GradeScale], percent: float) -> tuple[str, Optional[Decimal], Optional[bool]]:
    """(grade, points, is_pass). Falls back to the built-in bands."""
    if not scale or not scale.bands:
        return grade_for_percent(percent), None, None
    pct = Decimal(str(round(percent, 2)))
    # Bands are thresholds: the highest band the percentage reaches wins, so a
    # fractional mark between two integer bands (39.5 with 0-39 / 40-100) still
    # lands in the lower one.
    for b in sorted(scale.bands, key=lambda b: b.min_percent, reverse=True):
        if pct >= b.min_percent:
            return b.grade, b.points, b.is_pass
    lowest = min(scale.bands, key=lambda b: b.min_percent)
    return lowest.grade, lowest.points, lowest.is_pass


def seed_cbse(db: Session, user: User) -> GradeScale:
    """One-click CBSE-style scale for schools starting out."""
    existing = db.execute(
        select(GradeScale).where(GradeScale.school_id == user.school_id, GradeScale.name == "CBSE 8-point")
    ).scalar_one_or_none()
    if existing:
        return existing
    bands = [("A1", 91, 100, 10), ("A2", 81, 90, 9), ("B1", 71, 80, 8), ("B2", 61, 70, 7),
             ("C1", 51, 60, 6), ("C2", 41, 50, 5), ("D", 33, 40, 4), ("E", 0, 32, 0)]
    data = GradeScaleIn(
        name="CBSE 8-point",
        description="91-100 A1 … below 33 E (fail)",
        is_default=not default_scale(db, user.school_id),
        bands=[dict(grade=g, min_percent=lo, max_percent=hi, points=p, is_pass=lo >= 33) for g, lo, hi, p in bands],
    )
    return create_scale(db, user, data)


# ---------- exam types ----------


def list_exam_types(db: Session, school_id: int) -> list[ExamType]:
    return list(db.execute(
        select(ExamType).where(ExamType.school_id == school_id).order_by(ExamType.display_order, ExamType.name)
    ).scalars())


def create_exam_type(db: Session, user: User, data: ExamTypeIn) -> ExamType:
    t = ExamType(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    db.add(t)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("That code is already used")
    db.refresh(t)
    return t


def update_exam_type(db: Session, user: User, type_id: int, data: ExamTypeIn) -> ExamType:
    t = db.get(ExamType, type_id)
    if not t or t.school_id != user.school_id:
        raise _404("Exam type")
    for k, v in data.model_dump().items():
        setattr(t, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("That code is already used")
    db.refresh(t)
    return t


def delete_exam_type(db: Session, user: User, type_id: int) -> None:
    t = db.get(ExamType, type_id)
    if not t or t.school_id != user.school_id:
        raise _404("Exam type")
    if db.execute(select(Exam.id).where(Exam.exam_type_id == t.id).limit(1)).first():
        raise _400("Exams use this type; deactivate it instead")
    db.delete(t)
    db.commit()


def type_to_read(db: Session, t: ExamType) -> dict:
    n = db.execute(select(func.count()).select_from(Exam).where(Exam.exam_type_id == t.id)).scalar_one()
    return dict(id=t.id, name=t.name, code=t.code, weight_percent=t.weight_percent,
                display_order=t.display_order, is_active=t.is_active, exams=n)


# ---------- report card settings & remarks ----------


def settings(db: Session, school_id: int) -> ReportCardSetting:
    s = db.execute(select(ReportCardSetting).where(ReportCardSetting.school_id == school_id)).scalar_one_or_none()
    if not s:
        school_tenant = db.execute(select(Exam.tenant_id).where(Exam.school_id == school_id).limit(1)).scalar_one_or_none()
        s = ReportCardSetting(tenant_id=school_tenant or 1, school_id=school_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def update_settings(db: Session, user: User, data: ReportCardSettingIn) -> ReportCardSetting:
    s = settings(db, user.school_id)
    s.tenant_id = user.tenant_id
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


def can_remark(db: Session, user: User, student: Student) -> bool:
    if user.role in (UserRole.school_admin, UserRole.principal):
        return True
    sec = db.get(Section, student.section_id)
    return bool(sec and sec.class_teacher_user_id == user.id)


def remarks_for(db: Session, exam_id: int, student_ids) -> dict[int, ReportCardRemark]:
    ids = list(student_ids)
    if not ids:
        return {}
    return {
        r.student_id: r for r in db.execute(
            select(ReportCardRemark).where(ReportCardRemark.exam_id == exam_id, ReportCardRemark.student_id.in_(ids))
        ).scalars()
    }


def save_remark(db: Session, user: User, exam: Exam, student: Student, data: RemarkIn) -> ReportCardRemark:
    if not can_remark(db, user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the class teacher, principal or school admin can write remarks")
    r = db.execute(
        select(ReportCardRemark).where(ReportCardRemark.exam_id == exam.id, ReportCardRemark.student_id == student.id)
    ).scalar_one_or_none()
    if not r:
        r = ReportCardRemark(tenant_id=exam.tenant_id, school_id=exam.school_id, exam_id=exam.id, student_id=student.id)
        db.add(r)
    if data.teacher_remark is not None:
        r.teacher_remark = data.teacher_remark
    if data.principal_remark is not None:
        if user.role not in (UserRole.school_admin, UserRole.principal):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the principal writes the principal's remark")
        r.principal_remark = data.principal_remark
    r.updated_by_user_id = user.id
    db.commit()
    db.refresh(r)
    return r


# ---------- result approval ----------


def approve_results(db: Session, user: User, exam: Exam, approve: bool) -> Exam:
    from app.services import rbac_service

    if user.role not in (UserRole.school_admin, UserRole.principal) and not rbac_service.has_permission(db, user, "exams.approve_results"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the principal or school admin can approve results")
    if approve:
        exam.results_approved_by_user_id, exam.results_approved_at = user.id, datetime.now(timezone.utc)
    else:
        if exam.is_published:
            raise _400("Unpublish the results before withdrawing approval")
        exam.results_approved_by_user_id = exam.results_approved_at = None
    db.commit()
    db.refresh(exam)
    return exam


def check_publishable(db: Session, exam: Exam) -> None:
    if settings(db, exam.school_id).require_result_approval and not exam.results_approved_at:
        raise _400("Results need approval before they can be published")


def rank_map(db: Session, section_id: int, exam_id: int) -> dict[int, int]:
    """{student_id: rank} by total marks in a section, dense ranking."""
    from app.services import result_service

    students = list(db.execute(
        select(Student).where(Student.section_id == section_id, Student.is_active.is_(True))
    ).scalars())
    totals = []
    for s in students:
        try:
            r = result_service.build_student_result_for_admin(db, s.school_id, s.id, exam_id)
        except HTTPException:
            continue
        if r["summary"]["total_max"]:
            totals.append((s.id, r["summary"]["total_obtained"]))
    totals.sort(key=lambda t: -t[1])
    ranks: dict[int, int] = {}
    last_score, last_rank = None, 0
    for i, (sid, score) in enumerate(totals, start=1):
        if score != last_score:
            last_rank, last_score = i, score
        ranks[sid] = last_rank
    return ranks


def percent(value, total) -> Optional[int]:
    if not total:
        return None
    return int((Decimal(value) * 100 / Decimal(total)).quantize(Decimal(1), ROUND_HALF_UP))
