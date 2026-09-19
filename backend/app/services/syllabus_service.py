"""Syllabus (chapters and topics per class-subject), coverage per section,
and lesson plans with review.

Who can do what:
  - edit a syllabus / mark coverage: school admin, or the class-subject's teacher
  - view: also the principal and class teachers of that class's sections
  - lesson plans: written by the class-subject's teacher, reviewed by the
    school admin or principal"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import LessonPlanStatus, UserRole
from app.core.scoping import require_linked_child, school_today, section_labels
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.subject import ClassSubject, Subject
from app.models.syllabus import LessonPlan, LessonPlanTopic, SyllabusChapter, SyllabusTopic, TopicCoverage
from app.models.user import User
from app.schemas.syllabus import ChapterIn, CoverageIn, DeliverIn, LessonPlanIn, ReviewIn, TopicUpdate

REVIEWERS = (UserRole.school_admin, UserRole.principal)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _403(msg: str = "You can't change this syllabus") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)


# ---------- access ----------


def get_cs(db: Session, cs_id: int, school_id: int) -> ClassSubject:
    cs = db.get(ClassSubject, cs_id)
    if not cs or cs.school_id != school_id:
        raise _404("Class subject")
    return cs


def can_edit(user: User, cs: ClassSubject) -> bool:
    return user.role == UserRole.school_admin or cs.teacher_user_id == user.id


def _is_class_teacher(db: Session, user_id: int, class_id: int) -> bool:
    return db.execute(
        select(Section.id).where(Section.class_id == class_id, Section.class_teacher_user_id == user_id).limit(1)
    ).first() is not None


def check_view(db: Session, user: User, cs: ClassSubject) -> None:
    if user.role in REVIEWERS or can_edit(user, cs):
        return
    if user.role == UserRole.teacher and _is_class_teacher(db, user.id, cs.class_id):
        return
    raise _404("Class subject")


def check_edit(user: User, cs: ClassSubject) -> None:
    if not can_edit(user, cs):
        raise _403()


def _chapter(db: Session, chapter_id: int, user: User) -> tuple[SyllabusChapter, ClassSubject]:
    ch = db.get(SyllabusChapter, chapter_id)
    if not ch or ch.school_id != user.school_id:
        raise _404("Chapter")
    cs = db.get(ClassSubject, ch.class_subject_id)
    check_edit(user, cs)
    return ch, cs


def _topic(db: Session, topic_id: int, user: User) -> tuple[SyllabusTopic, SyllabusChapter, ClassSubject]:
    t = db.get(SyllabusTopic, topic_id)
    if not t or t.school_id != user.school_id:
        raise _404("Topic")
    ch = db.get(SyllabusChapter, t.chapter_id)
    return t, ch, db.get(ClassSubject, ch.class_subject_id)


# ---------- syllabus ----------


def _chapters(db: Session, cs_id: int) -> list[SyllabusChapter]:
    return list(db.execute(
        select(SyllabusChapter).where(SyllabusChapter.class_subject_id == cs_id)
        .order_by(SyllabusChapter.sequence, SyllabusChapter.id)
    ).scalars())


def _topics(db: Session, chapter_ids: list[int]) -> list[SyllabusTopic]:
    if not chapter_ids:
        return []
    return list(db.execute(
        select(SyllabusTopic).where(SyllabusTopic.chapter_id.in_(chapter_ids))
        .order_by(SyllabusTopic.chapter_id, SyllabusTopic.sequence, SyllabusTopic.id)
    ).scalars())


def _add_topics(db: Session, ch: SyllabusChapter, titles: list[str]) -> None:
    start = db.execute(
        select(func.coalesce(func.max(SyllabusTopic.sequence), 0)).where(SyllabusTopic.chapter_id == ch.id)
    ).scalar_one()
    for i, title in enumerate(titles, start=1):
        db.add(SyllabusTopic(tenant_id=ch.tenant_id, school_id=ch.school_id, chapter_id=ch.id,
                             title=title.strip()[:300], sequence=start + i))


def add_chapter(db: Session, user: User, cs: ClassSubject, data: ChapterIn) -> SyllabusChapter:
    check_edit(user, cs)
    seq = db.execute(
        select(func.coalesce(func.max(SyllabusChapter.sequence), 0)).where(SyllabusChapter.class_subject_id == cs.id)
    ).scalar_one()
    ch = SyllabusChapter(tenant_id=cs.tenant_id, school_id=cs.school_id, class_subject_id=cs.id, sequence=seq + 1,
                         **data.model_dump(exclude={"topics"}))
    db.add(ch)
    db.flush()
    _add_topics(db, ch, data.topics)
    db.commit()
    return ch


def update_chapter(db: Session, user: User, chapter_id: int, data: ChapterIn) -> None:
    ch, _ = _chapter(db, chapter_id, user)
    for k, v in data.model_dump(exclude={"topics"}).items():
        setattr(ch, k, v)
    if data.topics:
        _add_topics(db, ch, data.topics)
    db.commit()


def _has_coverage(db: Session, topic_ids) -> bool:
    return db.execute(select(TopicCoverage.id).where(TopicCoverage.topic_id.in_(topic_ids)).limit(1)).first() is not None


def delete_chapter(db: Session, user: User, chapter_id: int) -> None:
    ch, _ = _chapter(db, chapter_id, user)
    ids = select(SyllabusTopic.id).where(SyllabusTopic.chapter_id == ch.id)
    if _has_coverage(db, ids):
        raise _400("Some topics in this chapter are already marked as taught; unmark them first")
    db.delete(ch)
    db.commit()


def add_topics(db: Session, user: User, chapter_id: int, titles: list[str]) -> None:
    ch, _ = _chapter(db, chapter_id, user)
    titles = [t for t in titles if t.strip()]
    if not titles:
        raise _400("Enter at least one topic")
    _add_topics(db, ch, titles)
    db.commit()


def update_topic(db: Session, user: User, topic_id: int, data: TopicUpdate) -> None:
    t, _, cs = _topic(db, topic_id, user)
    check_edit(user, cs)
    t.title, t.planned_periods = data.title.strip(), data.planned_periods
    db.commit()


def delete_topic(db: Session, user: User, topic_id: int) -> None:
    t, _, cs = _topic(db, topic_id, user)
    check_edit(user, cs)
    if _has_coverage(db, [t.id]):
        raise _400("This topic is marked as taught in a section; unmark it first")
    db.delete(t)
    db.commit()


def reorder_chapters(db: Session, user: User, cs: ClassSubject, ids: list[int]) -> None:
    check_edit(user, cs)
    chapters = {c.id: c for c in _chapters(db, cs.id)}
    if set(ids) != set(chapters) or len(ids) != len(chapters):
        raise _400("Send every chapter of this syllabus exactly once")
    for i, cid in enumerate(ids, start=1):
        chapters[cid].sequence = i
    db.commit()


def reorder_topics(db: Session, user: User, chapter_id: int, ids: list[int]) -> None:
    ch, _ = _chapter(db, chapter_id, user)
    topics = {t.id: t for t in _topics(db, [ch.id])}
    if set(ids) != set(topics) or len(ids) != len(topics):
        raise _400("Send every topic of this chapter exactly once")
    for i, tid in enumerate(ids, start=1):
        topics[tid].sequence = i
    db.commit()


def copy_from(db: Session, user: User, cs: ClassSubject, source_id: int) -> int:
    """Copy chapters/topics (not dates or coverage) from another class-subject."""
    check_edit(user, cs)
    src = get_cs(db, source_id, cs.school_id)
    if src.id == cs.id:
        raise _400("Pick a different class")
    if src.subject_id != cs.subject_id:
        raise _400("You can only copy the same subject's syllabus")
    if _chapters(db, cs.id):
        raise _400("This syllabus already has chapters; copy only into an empty one")
    chapters = _chapters(db, src.id)
    if not chapters:
        raise _400("That class has no syllabus to copy")
    topics = _topics(db, [c.id for c in chapters])
    for c in chapters:
        new = SyllabusChapter(tenant_id=cs.tenant_id, school_id=cs.school_id, class_subject_id=cs.id,
                              title=c.title, sequence=c.sequence, description=c.description,
                              planned_periods=c.planned_periods)
        db.add(new)
        db.flush()
        for t in topics:
            if t.chapter_id == c.id:
                db.add(SyllabusTopic(tenant_id=cs.tenant_id, school_id=cs.school_id, chapter_id=new.id,
                                     title=t.title, sequence=t.sequence, planned_periods=t.planned_periods))
    db.commit()
    return len(chapters)


def copy_sources(db: Session, cs: ClassSubject) -> list[dict]:
    """Other class-subjects of the same subject that have a syllabus."""
    rows = db.execute(
        select(ClassSubject.id, SchoolClass.name, func.count(SyllabusChapter.id))
        .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
        .join(SyllabusChapter, SyllabusChapter.class_subject_id == ClassSubject.id)
        .where(ClassSubject.school_id == cs.school_id, ClassSubject.subject_id == cs.subject_id, ClassSubject.id != cs.id)
        .group_by(ClassSubject.id, SchoolClass.name)
        .order_by(SchoolClass.name)
    ).all()
    return [{"class_subject_id": i, "class_name": n, "chapters": c} for i, n, c in rows]


def set_coverage(db: Session, user: User, topic_id: int, data: CoverageIn) -> None:
    t, _, cs = _topic(db, topic_id, user)
    check_edit(user, cs)
    sec = db.get(Section, data.section_id)
    if not sec or sec.class_id != cs.class_id:
        raise _400("That section isn't in this class")
    row = db.execute(
        select(TopicCoverage).where(TopicCoverage.topic_id == t.id, TopicCoverage.section_id == sec.id)
    ).scalar_one_or_none()
    if not data.covered:
        if row:
            db.delete(row)
        db.commit()
        return
    on = data.covered_on or school_today(db, cs.school_id)
    if on > school_today(db, cs.school_id):
        raise _400("Can't mark a topic as taught in the future")
    if not row:
        row = TopicCoverage(tenant_id=cs.tenant_id, school_id=cs.school_id, topic_id=t.id, section_id=sec.id,
                            covered_on=on, teacher_user_id=user.id)
        db.add(row)
    row.covered_on, row.note = on, data.note
    db.commit()


def _progress(db: Session, cs_list: list[ClassSubject]) -> dict[int, dict]:
    """Per class-subject: chapter/topic counts and per-section progress."""
    cs_ids = [c.id for c in cs_list]
    if not cs_ids:
        return {}
    chapters = list(db.execute(select(SyllabusChapter).where(SyllabusChapter.class_subject_id.in_(cs_ids))).scalars())
    topics = _topics(db, [c.id for c in chapters])
    ch_by_id = {c.id: c for c in chapters}
    sections = list(db.execute(
        select(Section).where(Section.class_id.in_({c.class_id for c in cs_list})).order_by(Section.name)
    ).scalars())
    labels = section_labels(db, {s.id for s in sections})
    covered = set(db.execute(
        select(TopicCoverage.topic_id, TopicCoverage.section_id)
        .where(TopicCoverage.topic_id.in_([t.id for t in topics] or [-1]))
    ).all())
    today = school_today(db, cs_list[0].school_id)
    out = {}
    for cs in cs_list:
        cs_topics = [t for t in topics if ch_by_id[t.chapter_id].class_subject_id == cs.id]
        due = [t for t in cs_topics if ch_by_id[t.chapter_id].planned_end and ch_by_id[t.chapter_id].planned_end < today]
        secs = []
        for s in sections:
            if s.class_id != cs.class_id:
                continue
            n = sum((t.id, s.id) in covered for t in cs_topics)
            secs.append(dict(
                section_id=s.id, section_label=labels.get(s.id, s.name), covered=n, total=len(cs_topics),
                percent=round(100 * n / len(cs_topics)) if cs_topics else 0,
                behind=sum((t.id, s.id) not in covered for t in due),
            ))
        out[cs.id] = dict(
            chapters=sum(c.class_subject_id == cs.id for c in chapters), topics=len(cs_topics), sections=secs,
        )
    return out


def _summaries(db: Session, user: User, rows) -> list[dict]:
    cs_list = [cs for cs, _, _, _ in rows]
    prog = _progress(db, cs_list)
    teachers = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({cs.teacher_user_id for cs in cs_list if cs.teacher_user_id} or {-1}))
    ).all())
    out = []
    for cs, cname, sname, _ in rows:
        out.append(dict(
            class_subject_id=cs.id, class_id=cs.class_id, class_name=cname, subject_id=cs.subject_id,
            subject_name=sname, teacher_user_id=cs.teacher_user_id, teacher_name=teachers.get(cs.teacher_user_id),
            can_edit=can_edit(user, cs), **prog[cs.id],
        ))
    return out


def list_class_subjects(db: Session, user: User, academic_year_id: Optional[int]) -> list[dict]:
    stmt = (
        select(ClassSubject, SchoolClass.name, Subject.name, SchoolClass.display_order)
        .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ClassSubject.school_id == user.school_id)
    )
    if not academic_year_id:
        academic_year_id = db.execute(
            select(AcademicYear.id).where(AcademicYear.school_id == user.school_id, AcademicYear.is_current.is_(True))
        ).scalar_one_or_none()
    if academic_year_id:
        stmt = stmt.where(SchoolClass.academic_year_id == academic_year_id)
    if user.role not in REVIEWERS:
        taught_classes = select(Section.class_id).where(Section.class_teacher_user_id == user.id)
        stmt = stmt.where(or_(ClassSubject.teacher_user_id == user.id, ClassSubject.class_id.in_(taught_classes)))
    rows = db.execute(stmt.order_by(SchoolClass.display_order, SchoolClass.name, Subject.name)).all()
    return _summaries(db, user, rows)


def detail(db: Session, user: User, cs: ClassSubject) -> dict:
    check_view(db, user, cs)
    cname = db.get(SchoolClass, cs.class_id).name
    sname = db.get(Subject, cs.subject_id).name
    d = _summaries(db, user, [(cs, cname, sname, 0)])[0]
    chapters = _chapters(db, cs.id)
    topics = _topics(db, [c.id for c in chapters])
    cov: dict[int, dict] = {}
    for c in db.execute(select(TopicCoverage).where(TopicCoverage.topic_id.in_([t.id for t in topics] or [-1]))).scalars():
        cov.setdefault(c.topic_id, {})[c.section_id] = dict(covered_on=c.covered_on, note=c.note, lesson_plan_id=c.lesson_plan_id)
    d["items"] = [
        dict(
            id=c.id, title=c.title, sequence=c.sequence, description=c.description, planned_start=c.planned_start,
            planned_end=c.planned_end, planned_periods=c.planned_periods,
            topics=[
                dict(id=t.id, title=t.title, sequence=t.sequence, planned_periods=t.planned_periods, coverage=cov.get(t.id, {}))
                for t in topics if t.chapter_id == c.id
            ],
        )
        for c in chapters
    ]
    return d


def child_syllabus(db: Session, parent_user_id: int, student_id: int) -> list[dict]:
    st = require_linked_child(db, parent_user_id, student_id)
    sec = db.get(Section, st.section_id)
    rows = db.execute(
        select(ClassSubject, Subject.name, User.full_name)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .outerjoin(User, ClassSubject.teacher_user_id == User.id)
        .where(ClassSubject.class_id == sec.class_id)
        .order_by(ClassSubject.display_order, Subject.name)
    ).all()
    out = []
    for cs, sname, tname in rows:
        chapters = _chapters(db, cs.id)
        if not chapters:
            continue
        topics = _topics(db, [c.id for c in chapters])
        cov = dict(db.execute(
            select(TopicCoverage.topic_id, TopicCoverage.covered_on)
            .where(TopicCoverage.section_id == sec.id, TopicCoverage.topic_id.in_([t.id for t in topics] or [-1]))
        ).all())
        out.append(dict(
            subject_name=sname, teacher_name=tname, covered=len(cov), total=len(topics),
            percent=round(100 * len(cov) / len(topics)) if topics else 0,
            chapters=[
                dict(title=c.title, planned_start=c.planned_start, planned_end=c.planned_end,
                     topics=[dict(title=t.title, covered_on=cov.get(t.id)) for t in topics if t.chapter_id == c.id])
                for c in chapters
            ],
        ))
    return out


# ---------- lesson plans ----------


def _plan(db: Session, plan_id: int, user: User) -> LessonPlan:
    p = db.get(LessonPlan, plan_id)
    if not p or p.school_id != user.school_id:
        raise _404("Lesson plan")
    if user.role not in REVIEWERS and p.teacher_user_id != user.id:
        raise _404("Lesson plan")
    return p


def _own(db: Session, plan_id: int, user: User) -> LessonPlan:
    p = _plan(db, plan_id, user)
    if p.teacher_user_id != user.id:
        raise _403("Only the teacher who wrote this plan can change it")
    return p


def _set_topics(db: Session, p: LessonPlan, cs: ClassSubject, topic_ids: list[int]) -> None:
    ids = set(topic_ids)
    if ids:
        valid = set(db.execute(
            select(SyllabusTopic.id).join(SyllabusChapter, SyllabusTopic.chapter_id == SyllabusChapter.id)
            .where(SyllabusTopic.id.in_(ids), SyllabusChapter.class_subject_id == cs.id)
        ).scalars())
        if valid != ids:
            raise _400("Some topics aren't in this subject's syllabus")
    db.execute(LessonPlanTopic.__table__.delete().where(LessonPlanTopic.lesson_plan_id == p.id))
    for tid in ids:
        db.add(LessonPlanTopic(tenant_id=p.tenant_id, school_id=p.school_id, lesson_plan_id=p.id, topic_id=tid))


def _apply(db: Session, user: User, p: LessonPlan, data: LessonPlanIn) -> ClassSubject:
    cs = get_cs(db, data.class_subject_id, user.school_id)
    if cs.teacher_user_id != user.id:
        raise _403("You can only plan lessons for subjects you teach")
    sec = db.get(Section, data.section_id)
    if not sec or sec.class_id != cs.class_id:
        raise _400("That section isn't in this class")
    for k in ("class_subject_id", "section_id", "plan_date", "periods", "title", "objectives", "activities",
              "resources", "assessment", "homework"):
        setattr(p, k, getattr(data, k))
    return cs


def create_plan(db: Session, user: User, data: LessonPlanIn) -> LessonPlan:
    p = LessonPlan(tenant_id=user.tenant_id, school_id=user.school_id, teacher_user_id=user.id)
    cs = _apply(db, user, p, data)
    db.add(p)
    db.flush()
    _set_topics(db, p, cs, data.topic_ids)
    db.commit()
    return p


def update_plan(db: Session, user: User, plan_id: int, data: LessonPlanIn) -> LessonPlan:
    p = _own(db, plan_id, user)
    if p.delivered_on:
        raise _400("This lesson has been taught; it can't be edited")
    if p.status in (LessonPlanStatus.submitted, LessonPlanStatus.approved):
        # editing pulls it back for another review
        p.status = LessonPlanStatus.draft
    cs = _apply(db, user, p, data)
    _set_topics(db, p, cs, data.topic_ids)
    db.commit()
    return p


def delete_plan(db: Session, user: User, plan_id: int) -> None:
    p = _own(db, plan_id, user)
    if p.delivered_on:
        raise _400("This lesson has been taught; it can't be deleted")
    db.delete(p)
    db.commit()


def submit_plan(db: Session, user: User, plan_id: int) -> LessonPlan:
    p = _own(db, plan_id, user)
    if p.status not in (LessonPlanStatus.draft, LessonPlanStatus.returned):
        raise _400("This plan has already been submitted")
    p.status, p.submitted_at = LessonPlanStatus.submitted, datetime.now(timezone.utc)
    p.review_comment = None
    principals = list(db.execute(
        select(User.id).where(User.school_id == p.school_id, User.role == UserRole.principal, User.is_active.is_(True))
    ).scalars())
    notify.staff_users(db, tenant_id=p.tenant_id, school_id=p.school_id, user_ids=principals,
                       title=f"Lesson plan to review: {p.title}", body=f"From {user.full_name} for {p.plan_date:%d %b}.")
    db.commit()
    return p


def review_plan(db: Session, user: User, plan_id: int, data: ReviewIn) -> LessonPlan:
    p = _plan(db, plan_id, user)
    if user.role not in REVIEWERS:
        raise _403("Only the principal or school admin can review plans")
    if p.status != LessonPlanStatus.submitted:
        raise _400("Only submitted plans can be reviewed")
    p.status = LessonPlanStatus.approved if data.decision == "approve" else LessonPlanStatus.returned
    p.reviewed_by_user_id, p.reviewed_at, p.review_comment = user.id, datetime.now(timezone.utc), data.comment
    verb = "approved" if data.decision == "approve" else "returned for changes"
    notify.staff_users(db, tenant_id=p.tenant_id, school_id=p.school_id, user_ids=[p.teacher_user_id],
                       title=f"Lesson plan {verb}: {p.title}", body=data.comment or f"Your plan for {p.plan_date:%d %b} was {verb}.")
    db.commit()
    return p


def deliver_plan(db: Session, user: User, plan_id: int, data: DeliverIn) -> LessonPlan:
    p = _own(db, plan_id, user)
    if p.status == LessonPlanStatus.returned:
        raise _400("This plan was returned for changes; update and resubmit it first")
    if data.delivered_on > school_today(db, p.school_id):
        raise _400("Can't record a lesson in the future")
    p.delivered_on, p.delivery_note = data.delivered_on, data.note
    topic_ids = list(db.execute(select(LessonPlanTopic.topic_id).where(LessonPlanTopic.lesson_plan_id == p.id)).scalars())
    have = set(db.execute(
        select(TopicCoverage.topic_id).where(TopicCoverage.section_id == p.section_id, TopicCoverage.topic_id.in_(topic_ids or [-1]))
    ).scalars())
    for tid in topic_ids:
        if tid not in have:
            db.add(TopicCoverage(tenant_id=p.tenant_id, school_id=p.school_id, topic_id=tid, section_id=p.section_id,
                                 covered_on=data.delivered_on, teacher_user_id=user.id, lesson_plan_id=p.id))
    db.commit()
    return p


def list_plans(db: Session, user: User, *, status_: Optional[LessonPlanStatus], teacher_user_id: Optional[int],
               class_subject_id: Optional[int], start, end, limit: int = 200) -> list[LessonPlan]:
    stmt = select(LessonPlan).where(LessonPlan.school_id == user.school_id)
    if user.role not in REVIEWERS:
        stmt = stmt.where(LessonPlan.teacher_user_id == user.id)
    elif teacher_user_id:
        stmt = stmt.where(LessonPlan.teacher_user_id == teacher_user_id)
    if status_:
        stmt = stmt.where(LessonPlan.status == status_)
    if class_subject_id:
        stmt = stmt.where(LessonPlan.class_subject_id == class_subject_id)
    if start:
        stmt = stmt.where(LessonPlan.plan_date >= start)
    if end:
        stmt = stmt.where(LessonPlan.plan_date <= end)
    return list(db.execute(stmt.order_by(LessonPlan.plan_date.desc(), LessonPlan.id.desc()).limit(limit)).scalars())


def plans_to_read(db: Session, plans: list[LessonPlan]) -> list[dict]:
    if not plans:
        return []
    users = dict(db.execute(
        select(User.id, User.full_name).where(
            User.id.in_({p.teacher_user_id for p in plans} | {p.reviewed_by_user_id for p in plans if p.reviewed_by_user_id})
        )
    ).all())
    subjects = dict(db.execute(
        select(ClassSubject.id, Subject.name).join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ClassSubject.id.in_({p.class_subject_id for p in plans}))
    ).all())
    labels = section_labels(db, {p.section_id for p in plans})
    topics: dict[int, list] = {}
    for pid, tid, title, ctitle in db.execute(
        select(LessonPlanTopic.lesson_plan_id, SyllabusTopic.id, SyllabusTopic.title, SyllabusChapter.title)
        .join(SyllabusTopic, LessonPlanTopic.topic_id == SyllabusTopic.id)
        .join(SyllabusChapter, SyllabusTopic.chapter_id == SyllabusChapter.id)
        .where(LessonPlanTopic.lesson_plan_id.in_([p.id for p in plans]))
        .order_by(SyllabusChapter.sequence, SyllabusTopic.sequence)
    ).all():
        topics.setdefault(pid, []).append(dict(id=tid, title=title, chapter_title=ctitle))
    return [
        dict(
            id=p.id, teacher_user_id=p.teacher_user_id, teacher_name=users.get(p.teacher_user_id, ""),
            class_subject_id=p.class_subject_id, subject_name=subjects.get(p.class_subject_id, ""),
            section_id=p.section_id, section_label=labels.get(p.section_id, ""), plan_date=p.plan_date,
            periods=p.periods, title=p.title, objectives=p.objectives, activities=p.activities,
            resources=p.resources, assessment=p.assessment, homework=p.homework, status=p.status,
            submitted_at=p.submitted_at, reviewed_by_name=users.get(p.reviewed_by_user_id),
            reviewed_at=p.reviewed_at, review_comment=p.review_comment, delivered_on=p.delivered_on,
            delivery_note=p.delivery_note, topics=topics.get(p.id, []),
        )
        for p in plans
    ]
