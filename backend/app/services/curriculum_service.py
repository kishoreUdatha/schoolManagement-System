"""Learning outcomes and the teaching resource library.

Outcomes hang off a class-subject (optionally a chapter) and are mapped to the
topics that teach them, so "is this outcome covered in 7-A?" is answered by what
has actually been taught rather than by a second tick-list.

Resources are files or links kept against a class-subject; a teacher can share
one with parents, and only then does it show up in the parent portal.

Who can do what follows the syllabus: the school admin or the class-subject's
teacher edits; the principal and the class's class-teachers can look.
"""
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.enums import ResourceKind, UserRole
from app.core.scoping import require_linked_child, section_label
from app.models.academic import Section
from app.models.curriculum import LearningOutcome, OutcomeTopic, TeachingResource
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.syllabus import SyllabusChapter, SyllabusTopic, TopicCoverage
from app.models.user import User
from app.schemas.curriculum import OutcomeIn, OutcomeUpdate, ResourceUpdate
from app.services import syllabus_service as syl


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# ---------- learning outcomes ----------


def _outcome(db: Session, outcome_id: int, user: User) -> tuple[LearningOutcome, ClassSubject]:
    o = db.get(LearningOutcome, outcome_id)
    if not o or o.school_id != user.school_id:
        raise _404("Learning outcome")
    return o, syl.get_cs(db, o.class_subject_id, user.school_id)


def _code_taken(db: Session, cs_id: int, code: str, ignore_id: Optional[int] = None) -> bool:
    stmt = select(LearningOutcome.id).where(
        LearningOutcome.class_subject_id == cs_id, func.lower(LearningOutcome.code) == code.lower()
    )
    if ignore_id:
        stmt = stmt.where(LearningOutcome.id != ignore_id)
    return db.execute(stmt.limit(1)).first() is not None


def _check_topics(db: Session, cs: ClassSubject, topic_ids: list[int]) -> list[int]:
    """Topics must belong to this class-subject's own syllabus."""
    if not topic_ids:
        return []
    ok = set(db.execute(
        select(SyllabusTopic.id)
        .join(SyllabusChapter, SyllabusChapter.id == SyllabusTopic.chapter_id)
        .where(SyllabusChapter.class_subject_id == cs.id, SyllabusTopic.id.in_(set(topic_ids)))
    ).scalars())
    missing = set(topic_ids) - ok
    if missing:
        raise _400("Those topics aren't part of this subject's syllabus")
    return sorted(ok)


def _set_topics(db: Session, outcome: LearningOutcome, topic_ids: list[int]) -> None:
    db.execute(sa_delete(OutcomeTopic).where(OutcomeTopic.outcome_id == outcome.id))
    for tid in topic_ids:
        db.add(OutcomeTopic(tenant_id=outcome.tenant_id, school_id=outcome.school_id,
                            outcome_id=outcome.id, topic_id=tid))


def create_outcome(db: Session, user: User, data: OutcomeIn) -> LearningOutcome:
    cs = syl.get_cs(db, data.class_subject_id, user.school_id)
    syl.check_edit(user, cs)
    code = data.code.strip()
    if _code_taken(db, cs.id, code):
        raise _400(f"Outcome {code} already exists for this subject")
    if data.chapter_id:
        ch = db.get(SyllabusChapter, data.chapter_id)
        if not ch or ch.class_subject_id != cs.id:
            raise _404("Chapter")
    topic_ids = _check_topics(db, cs, data.topic_ids)
    seq = db.execute(
        select(func.coalesce(func.max(LearningOutcome.sequence), 0)).where(LearningOutcome.class_subject_id == cs.id)
    ).scalar_one()
    o = LearningOutcome(
        tenant_id=cs.tenant_id, school_id=cs.school_id, class_subject_id=cs.id, chapter_id=data.chapter_id,
        code=code, statement=data.statement.strip(), bloom_level=data.bloom_level, sequence=seq + 1,
    )
    db.add(o)
    db.flush()
    _set_topics(db, o, topic_ids)
    db.commit()
    return o


def update_outcome(db: Session, user: User, outcome_id: int, data: OutcomeUpdate) -> LearningOutcome:
    o, cs = _outcome(db, outcome_id, user)
    syl.check_edit(user, cs)
    fields = data.model_dump(exclude_unset=True, exclude={"topic_ids"})
    if "code" in fields and fields["code"]:
        code = fields["code"].strip()
        if _code_taken(db, cs.id, code, ignore_id=o.id):
            raise _400(f"Outcome {code} already exists for this subject")
        fields["code"] = code
    if fields.get("chapter_id"):
        ch = db.get(SyllabusChapter, fields["chapter_id"])
        if not ch or ch.class_subject_id != cs.id:
            raise _404("Chapter")
    for k, v in fields.items():
        setattr(o, k, v)
    if data.topic_ids is not None:
        _set_topics(db, o, _check_topics(db, cs, data.topic_ids))
    db.commit()
    return o


def delete_outcome(db: Session, user: User, outcome_id: int) -> None:
    o, cs = _outcome(db, outcome_id, user)
    syl.check_edit(user, cs)
    db.delete(o)
    db.commit()


def _topic_map(db: Session, outcome_ids: list[int]) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {i: [] for i in outcome_ids}
    if not outcome_ids:
        return out
    for oid, tid in db.execute(
        select(OutcomeTopic.outcome_id, OutcomeTopic.topic_id).where(OutcomeTopic.outcome_id.in_(outcome_ids))
    ):
        out[oid].append(tid)
    return out


def _to_read(db: Session, outcomes: list[LearningOutcome], covered_topics: Optional[set[int]] = None) -> list[dict]:
    if not outcomes:
        return []
    tmap = _topic_map(db, [o.id for o in outcomes])
    all_topics = {t for ids in tmap.values() for t in ids}
    titles = dict(db.execute(select(SyllabusTopic.id, SyllabusTopic.title).where(SyllabusTopic.id.in_(all_topics))).all()) if all_topics else {}
    chapters = dict(db.execute(
        select(SyllabusChapter.id, SyllabusChapter.title)
        .where(SyllabusChapter.id.in_({o.chapter_id for o in outcomes if o.chapter_id}))
    ).all()) if any(o.chapter_id for o in outcomes) else {}
    rows = []
    for o in outcomes:
        tids = tmap.get(o.id, [])
        done = [t for t in tids if covered_topics and t in covered_topics]
        rows.append({
            "id": o.id,
            "class_subject_id": o.class_subject_id,
            "chapter_id": o.chapter_id,
            "chapter_title": chapters.get(o.chapter_id) if o.chapter_id else None,
            "code": o.code,
            "statement": o.statement,
            "bloom_level": o.bloom_level,
            "sequence": o.sequence,
            "is_active": o.is_active,
            "topics": [{"id": t, "title": titles.get(t, "")} for t in tids],
            "topics_covered": len(done) if covered_topics is not None else None,
            "status": (
                None if covered_topics is None
                else "not_started" if not done
                else "covered" if len(done) == len(tids)
                else "in_progress"
            ),
        })
    return rows


def _covered_topics(db: Session, section_id: int) -> set[int]:
    return set(db.execute(select(TopicCoverage.topic_id).where(TopicCoverage.section_id == section_id)).scalars())


def list_outcomes(db: Session, user: User, cs_id: int, chapter_id: Optional[int] = None,
                  section_id: Optional[int] = None, active_only: bool = False) -> list[dict]:
    cs = syl.get_cs(db, cs_id, user.school_id)
    syl.check_view(db, user, cs)
    stmt = select(LearningOutcome).where(LearningOutcome.class_subject_id == cs.id)
    if chapter_id:
        stmt = stmt.where(LearningOutcome.chapter_id == chapter_id)
    if active_only:
        stmt = stmt.where(LearningOutcome.is_active.is_(True))
    outcomes = list(db.execute(stmt.order_by(LearningOutcome.sequence, LearningOutcome.id)).scalars())
    covered = None
    if section_id:
        sec = db.get(Section, section_id)
        if not sec or sec.school_id != user.school_id or sec.class_id != cs.class_id:
            raise _404("Section")
        covered = _covered_topics(db, section_id)
    return _to_read(db, outcomes, covered)


def get_outcome(db: Session, user: User, outcome_id: int, section_id: Optional[int] = None) -> dict:
    o, cs = _outcome(db, outcome_id, user)
    syl.check_view(db, user, cs)
    covered = _covered_topics(db, section_id) if section_id else None
    return _to_read(db, [o], covered)[0]


def coverage(db: Session, user: User, cs_id: int, section_id: int) -> dict:
    """How much of the subject's outcomes a section has met so far."""
    rows = list_outcomes(db, user, cs_id, section_id=section_id, active_only=True)
    counts = {"covered": 0, "in_progress": 0, "not_started": 0, "unmapped": 0}
    for r in rows:
        if not r["topics"]:
            counts["unmapped"] += 1
        else:
            counts[r["status"]] += 1
    cs = db.get(ClassSubject, cs_id)
    return {
        "class_subject_id": cs_id,
        "subject_name": db.get(Subject, cs.subject_id).name if cs else "",
        "section_id": section_id,
        "section_label": section_label(db, section_id),
        "total": len(rows),
        **counts,
        "outcomes": rows,
    }


# ---------- teaching resources ----------


def _resource(db: Session, resource_id: int, school_id: int) -> TeachingResource:
    r = db.get(TeachingResource, resource_id)
    if not r or r.school_id != school_id:
        raise _404("Resource")
    return r


def _resource_read(db: Session, rows: list[TeachingResource]) -> list[dict]:
    if not rows:
        return []
    cs_ids = {r.class_subject_id for r in rows}
    subjects = dict(db.execute(
        select(ClassSubject.id, Subject.name).join(Subject, Subject.id == ClassSubject.subject_id)
        .where(ClassSubject.id.in_(cs_ids))
    ).all())
    chapters = dict(db.execute(
        select(SyllabusChapter.id, SyllabusChapter.title).where(SyllabusChapter.id.in_({r.chapter_id for r in rows if r.chapter_id}))
    ).all()) if any(r.chapter_id for r in rows) else {}
    topics = dict(db.execute(
        select(SyllabusTopic.id, SyllabusTopic.title).where(SyllabusTopic.id.in_({r.topic_id for r in rows if r.topic_id}))
    ).all()) if any(r.topic_id for r in rows) else {}
    names = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({r.uploaded_by_user_id for r in rows if r.uploaded_by_user_id}))
    ).all()) if any(r.uploaded_by_user_id for r in rows) else {}
    return [{
        "id": r.id,
        "class_subject_id": r.class_subject_id,
        "subject_name": subjects.get(r.class_subject_id),
        "chapter_id": r.chapter_id,
        "chapter_title": chapters.get(r.chapter_id) if r.chapter_id else None,
        "topic_id": r.topic_id,
        "topic_title": topics.get(r.topic_id) if r.topic_id else None,
        "title": r.title,
        "description": r.description,
        "kind": r.kind,
        "url": r.url,
        "file_name": r.file_name,
        "size_bytes": r.size_bytes,
        "has_file": r.file_key is not None,
        "visible_to_parents": r.visible_to_parents,
        "downloads": r.downloads,
        "uploaded_by_name": names.get(r.uploaded_by_user_id),
        "created_at": r.created_at,
        "is_active": r.is_active,
    } for r in rows]


def list_resources(db: Session, user: User, cs_id: Optional[int] = None, chapter_id: Optional[int] = None,
                   kind: Optional[ResourceKind] = None, search: Optional[str] = None,
                   include_inactive: bool = False) -> list[dict]:
    stmt = select(TeachingResource).where(TeachingResource.school_id == user.school_id)
    if cs_id:
        cs = syl.get_cs(db, cs_id, user.school_id)
        syl.check_view(db, user, cs)
        stmt = stmt.where(TeachingResource.class_subject_id == cs_id)
    elif user.role == UserRole.teacher and not syl.coordinates(user):
        # a teacher without a subject filter sees their own subjects' shelf
        mine = select(ClassSubject.id).where(ClassSubject.teacher_user_id == user.id)
        stmt = stmt.where(TeachingResource.class_subject_id.in_(mine))
    if chapter_id:
        stmt = stmt.where(TeachingResource.chapter_id == chapter_id)
    if kind:
        stmt = stmt.where(TeachingResource.kind == kind)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(TeachingResource.title.ilike(like))
    if not include_inactive:
        stmt = stmt.where(TeachingResource.is_active.is_(True))
    rows = list(db.execute(stmt.order_by(TeachingResource.created_at.desc())).scalars())
    return _resource_read(db, rows)


def get_resource(db: Session, user: User, resource_id: int) -> dict:
    r = _resource(db, resource_id, user.school_id)
    syl.check_view(db, user, syl.get_cs(db, r.class_subject_id, user.school_id))
    return _resource_read(db, [r])[0]


def create_resource(db: Session, user: User, *, class_subject_id: int, title: str, kind: ResourceKind,
                    description: Optional[str], url: Optional[str], chapter_id: Optional[int],
                    topic_id: Optional[int], visible_to_parents: bool,
                    file: Optional[UploadFile]) -> dict:
    cs = syl.get_cs(db, class_subject_id, user.school_id)
    syl.check_edit(user, cs)
    if not file and not url:
        raise _400("Attach a file or give a link")
    if file and url:
        raise _400("Give either a file or a link, not both")
    if chapter_id:
        ch = db.get(SyllabusChapter, chapter_id)
        if not ch or ch.class_subject_id != cs.id:
            raise _404("Chapter")
    if topic_id:
        t = db.get(SyllabusTopic, topic_id)
        if not t or t.chapter_id != chapter_id:
            raise _400("That topic isn't in the chapter you picked")
    saved = storage.save_upload(cs.school_id, "resources", file) if file else None
    r = TeachingResource(
        tenant_id=cs.tenant_id, school_id=cs.school_id, class_subject_id=cs.id, chapter_id=chapter_id,
        topic_id=topic_id, title=title.strip()[:200], description=description, kind=kind,
        url=(url.strip() if url else None), visible_to_parents=visible_to_parents,
        uploaded_by_user_id=user.id,
        file_key=saved["key"] if saved else None,
        file_name=saved["original_name"] if saved else None,
        content_type=saved["content_type"] if saved else None,
        size_bytes=saved["size_bytes"] if saved else None,
    )
    db.add(r)
    db.commit()
    return _resource_read(db, [r])[0]


def update_resource(db: Session, user: User, resource_id: int, data: ResourceUpdate) -> dict:
    r = _resource(db, resource_id, user.school_id)
    syl.check_edit(user, syl.get_cs(db, r.class_subject_id, user.school_id))
    fields = data.model_dump(exclude_unset=True)
    if fields.get("chapter_id"):
        ch = db.get(SyllabusChapter, fields["chapter_id"])
        if not ch or ch.class_subject_id != r.class_subject_id:
            raise _404("Chapter")
    if fields.get("url") and r.file_key:
        raise _400("This resource is a file; delete it and add a link instead")
    for k, v in fields.items():
        setattr(r, k, v)
    db.commit()
    return _resource_read(db, [r])[0]


def delete_resource(db: Session, user: User, resource_id: int) -> None:
    r = _resource(db, resource_id, user.school_id)
    syl.check_edit(user, syl.get_cs(db, r.class_subject_id, user.school_id))
    if r.file_key:
        storage.delete(r.file_key)
    db.delete(r)
    db.commit()


def download(db: Session, resource_id: int, school_id: int, *, user: Optional[User] = None,
             parent_view: bool = False) -> TeachingResource:
    r = _resource(db, resource_id, school_id)
    if parent_view and not (r.visible_to_parents and r.is_active):
        raise _404("Resource")
    if not parent_view and user is not None:
        syl.check_view(db, user, syl.get_cs(db, r.class_subject_id, school_id))
    if not r.file_key:
        raise _400("This resource is a link, not a file")
    r.downloads += 1
    db.commit()
    return r


# ---------- parent view ----------


def child_resources(db: Session, user: User, student_id: int, subject_id: Optional[int] = None) -> list[dict]:
    student: Student = require_linked_child(db, user.id, student_id)
    sec = db.get(Section, student.section_id)
    stmt = (
        select(TeachingResource)
        .join(ClassSubject, ClassSubject.id == TeachingResource.class_subject_id)
        .where(
            TeachingResource.school_id == student.school_id,
            TeachingResource.visible_to_parents.is_(True),
            TeachingResource.is_active.is_(True),
            ClassSubject.class_id == (sec.class_id if sec else -1),
        )
    )
    if subject_id:
        stmt = stmt.where(ClassSubject.subject_id == subject_id)
    rows = list(db.execute(stmt.order_by(TeachingResource.created_at.desc())).scalars())
    return _resource_read(db, rows)
