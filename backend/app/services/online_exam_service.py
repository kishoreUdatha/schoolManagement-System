"""Question bank (Bloom's level, difficulty, chapter) and timed online tests.

Access:
  - question bank: school admin (all subjects); teachers for subjects they teach;
    principal read-only
  - a test belongs to a class-subject; its teacher or the admin manages it
  - students sit tests through the parent portal (no student logins yet)

Timing is enforced on the server: an attempt's deadline is min(start + duration,
test end). Anything read after the deadline is auto-submitted first."""
import random
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import (
    AttemptStatus,
    BloomLevel,
    NoticeAudience,
    OnlineTestStatus,
    QuestionKind,
    ResultVisibility,
    UserRole,
)
from app.core.scoping import require_linked_child, section_labels
from app.models.academic import SchoolClass, Section
from app.models.online_exam import AttemptAnswer, OnlineTest, OnlineTestQuestion, Question, TestAttempt
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.syllabus import SyllabusChapter
from app.models.user import User
from app.schemas.online_exam import AutoPickIn, GradeIn, QuestionIn, TestIn

GRACE = timedelta(seconds=30)  # network slack when saving right at the deadline
OBJECTIVE = (QuestionKind.single, QuestionKind.multiple, QuestionKind.true_false, QuestionKind.numeric)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _403(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pct(score, total) -> Optional[int]:
    if score is None or not total:
        return None
    return int((Decimal(score) * 100 / Decimal(total)).quantize(Decimal(1), ROUND_HALF_UP))


# ---------- access ----------


def taught_subject_ids(db: Session, user: User) -> set[int]:
    return set(db.execute(
        select(ClassSubject.subject_id).where(ClassSubject.school_id == user.school_id, ClassSubject.teacher_user_id == user.id)
    ).scalars())


def _can_edit_subject(db: Session, user: User, subject_id: int) -> bool:
    return user.role == UserRole.school_admin or subject_id in taught_subject_ids(db, user)


def _can_manage(user: User, cs: ClassSubject) -> bool:
    return user.role == UserRole.school_admin or cs.teacher_user_id == user.id


# ---------- question bank ----------


def _check_question_refs(db: Session, user: User, data: QuestionIn) -> None:
    subj = db.get(Subject, data.subject_id)
    if not subj or subj.school_id != user.school_id:
        raise _400("Pick a subject of this school")
    if not _can_edit_subject(db, user, subj.id):
        raise _403("You can only write questions for subjects you teach")
    if data.chapter_id is not None:
        ch = db.get(SyllabusChapter, data.chapter_id)
        cs = db.get(ClassSubject, ch.class_subject_id) if ch else None
        if not ch or ch.school_id != user.school_id or cs.subject_id != subj.id:
            raise _400("That chapter isn't in this subject's syllabus")


def _apply_question(q: Question, data: QuestionIn) -> None:
    for k in ("subject_id", "class_level", "chapter_id", "topic", "kind", "text", "answer", "explanation", "marks",
              "bloom_level", "difficulty"):
        setattr(q, k, getattr(data, k))
    q.options = [o.model_dump() for o in data.options]
    q.class_level = (data.class_level or "").strip() or None


def create_question(db: Session, user: User, data: QuestionIn) -> Question:
    _check_question_refs(db, user, data)
    q = Question(tenant_id=user.tenant_id, school_id=user.school_id, created_by_user_id=user.id)
    _apply_question(q, data)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def get_question(db: Session, user: User, qid: int) -> Question:
    q = db.get(Question, qid)
    if not q or q.school_id != user.school_id:
        raise _404("Question")
    if user.role == UserRole.teacher and q.subject_id not in taught_subject_ids(db, user):
        raise _404("Question")
    return q


def _in_open_or_closed_test(db: Session, qid: int) -> bool:
    return db.execute(
        select(OnlineTestQuestion.id).join(OnlineTest, OnlineTestQuestion.test_id == OnlineTest.id)
        .where(OnlineTestQuestion.question_id == qid, OnlineTest.status != OnlineTestStatus.draft).limit(1)
    ).first() is not None


def update_question(db: Session, user: User, qid: int, data: QuestionIn) -> Question:
    q = get_question(db, user, qid)
    _check_question_refs(db, user, data)
    if _in_open_or_closed_test(db, q.id) and (q.kind != data.kind or q.answer != data.answer or q.options != [o.model_dump() for o in data.options]):
        raise _400("This question is in a published test; its options and answer can't change. Duplicate it instead")
    _apply_question(q, data)
    db.commit()
    db.refresh(q)
    return q


def set_question_active(db: Session, user: User, qid: int, active: bool) -> Question:
    q = get_question(db, user, qid)
    if not _can_edit_subject(db, user, q.subject_id):
        raise _403("You can only change questions for subjects you teach")
    q.is_active = active
    db.commit()
    db.refresh(q)
    return q


def delete_question(db: Session, user: User, qid: int) -> None:
    q = get_question(db, user, qid)
    if not _can_edit_subject(db, user, q.subject_id):
        raise _403("You can only change questions for subjects you teach")
    if db.execute(select(OnlineTestQuestion.id).where(OnlineTestQuestion.question_id == q.id).limit(1)).first():
        raise _400("This question is used in a test; deactivate it instead")
    db.delete(q)
    db.commit()


def _question_filter(stmt, user_subjects: Optional[set[int]], subject_id=None, class_level=None, chapter_id=None,
                     bloom_level=None, difficulty=None, kind=None, search=None, active_only=True):
    if user_subjects is not None:
        stmt = stmt.where(Question.subject_id.in_(user_subjects or {-1}))
    if subject_id:
        stmt = stmt.where(Question.subject_id == subject_id)
    if class_level:
        stmt = stmt.where(Question.class_level == class_level)
    if chapter_id:
        stmt = stmt.where(Question.chapter_id == chapter_id)
    if bloom_level:
        stmt = stmt.where(Question.bloom_level == bloom_level)
    if difficulty:
        stmt = stmt.where(Question.difficulty == difficulty)
    if kind:
        stmt = stmt.where(Question.kind == kind)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Question.text.ilike(like), Question.topic.ilike(like)))
    if active_only:
        stmt = stmt.where(Question.is_active.is_(True))
    return stmt


def _scope_subjects(db: Session, user: User) -> Optional[set[int]]:
    return taught_subject_ids(db, user) if user.role == UserRole.teacher else None


def list_questions(db: Session, user: User, *, limit: int, offset: int, **filters) -> dict:
    scope = _scope_subjects(db, user)
    base = _question_filter(select(Question).where(Question.school_id == user.school_id), scope, **filters)
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = list(db.execute(base.order_by(Question.id.desc()).limit(limit).offset(offset)).scalars())
    blooms = dict(db.execute(
        _question_filter(select(Question.bloom_level, func.count()).where(Question.school_id == user.school_id), scope, **filters)
        .group_by(Question.bloom_level)
    ).all())
    return dict(total=total, items=questions_to_read(db, rows), by_bloom={b.value: n for b, n in blooms.items()})


def questions_to_read(db: Session, qs: list[Question]) -> list[dict]:
    if not qs:
        return []
    subjects = dict(db.execute(select(Subject.id, Subject.name).where(Subject.id.in_({q.subject_id for q in qs}))).all())
    chapters = dict(db.execute(
        select(SyllabusChapter.id, SyllabusChapter.title).where(SyllabusChapter.id.in_({q.chapter_id for q in qs if q.chapter_id} or {-1}))
    ).all())
    used = dict(db.execute(
        select(OnlineTestQuestion.question_id, func.count()).where(OnlineTestQuestion.question_id.in_([q.id for q in qs]))
        .group_by(OnlineTestQuestion.question_id)
    ).all())
    return [
        dict(id=q.id, subject_id=q.subject_id, subject_name=subjects.get(q.subject_id, ""), class_level=q.class_level,
             chapter_id=q.chapter_id, chapter_title=chapters.get(q.chapter_id), topic=q.topic, kind=q.kind, text=q.text,
             options=q.options, answer=q.answer, explanation=q.explanation, marks=q.marks, bloom_level=q.bloom_level,
             difficulty=q.difficulty, is_active=q.is_active, used_in_tests=used.get(q.id, 0))
        for q in qs
    ]


# ---------- tests ----------


def get_test(db: Session, user: User, test_id: int) -> tuple[OnlineTest, ClassSubject]:
    t = db.get(OnlineTest, test_id)
    if not t or t.school_id != user.school_id:
        raise _404("Test")
    cs = db.get(ClassSubject, t.class_subject_id)
    if user.role == UserRole.teacher and cs.teacher_user_id != user.id:
        raise _404("Test")
    return t, cs


def _managed(db: Session, user: User, test_id: int) -> tuple[OnlineTest, ClassSubject]:
    t, cs = get_test(db, user, test_id)
    if not _can_manage(user, cs):
        raise _403("Only the subject teacher or the school admin can change this test")
    return t, cs


def _is_open(t: OnlineTest, now: Optional[datetime] = None) -> bool:
    now = now or _now()
    return t.status == OnlineTestStatus.published and t.starts_at <= now < t.ends_at


def _is_over(t: OnlineTest, now: Optional[datetime] = None) -> bool:
    return t.status == OnlineTestStatus.closed or (now or _now()) >= t.ends_at


def _apply_test(db: Session, user: User, t: OnlineTest, data: TestIn) -> ClassSubject:
    cs = db.get(ClassSubject, data.class_subject_id)
    if not cs or cs.school_id != user.school_id:
        raise _400("Pick a class subject of this school")
    if not _can_manage(user, cs):
        raise _403("You can only set tests for subjects you teach")
    if data.section_id is not None:
        sec = db.get(Section, data.section_id)
        if not sec or sec.class_id != cs.class_id:
            raise _400("That section isn't in this class")
    for k in ("class_subject_id", "section_id", "title", "instructions", "starts_at", "ends_at", "duration_minutes",
              "shuffle_questions", "shuffle_options", "negative_marking", "result_visibility"):
        setattr(t, k, getattr(data, k))
    return cs


def create_test(db: Session, user: User, data: TestIn) -> OnlineTest:
    t = OnlineTest(tenant_id=user.tenant_id, school_id=user.school_id, created_by_user_id=user.id)
    _apply_test(db, user, t, data)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def update_test(db: Session, user: User, test_id: int, data: TestIn) -> OnlineTest:
    t, cs = _managed(db, user, test_id)
    if t.status == OnlineTestStatus.closed:
        raise _400("This test is closed")
    if t.status == OnlineTestStatus.published:
        if _has_attempts(db, t.id):
            raise _400("Students have started this test; it can't be edited")
        if data.class_subject_id != t.class_subject_id:
            raise _400("A published test can't move to another subject")
    _apply_test(db, user, t, data)
    db.commit()
    db.refresh(t)
    return t


def _has_attempts(db: Session, test_id: int) -> bool:
    return db.execute(select(TestAttempt.id).where(TestAttempt.test_id == test_id).limit(1)).first() is not None


def delete_test(db: Session, user: User, test_id: int) -> None:
    t, _ = _managed(db, user, test_id)
    if _has_attempts(db, t.id):
        raise _400("Students have taken this test; close it instead")
    db.delete(t)
    db.commit()


def _test_questions(db: Session, test_id: int) -> list[tuple[OnlineTestQuestion, Question]]:
    return list(db.execute(
        select(OnlineTestQuestion, Question).join(Question, OnlineTestQuestion.question_id == Question.id)
        .where(OnlineTestQuestion.test_id == test_id).order_by(OnlineTestQuestion.sequence)
    ).all())


def _editable_paper(db: Session, user: User, test_id: int) -> tuple[OnlineTest, ClassSubject]:
    t, cs = _managed(db, user, test_id)
    if t.status != OnlineTestStatus.draft:
        raise _400("Questions can only change while the test is a draft")
    return t, cs


def add_questions(db: Session, user: User, test_id: int, qids: list[int], marks: Optional[Decimal]) -> int:
    t, cs = _editable_paper(db, user, test_id)
    qs = list(db.execute(select(Question).where(Question.id.in_(set(qids)), Question.school_id == t.school_id)).scalars())
    if len(qs) != len(set(qids)):
        raise _400("Some questions weren't found")
    if any(q.subject_id != cs.subject_id for q in qs):
        raise _400("All questions must be from this test's subject")
    if any(not q.is_active for q in qs):
        raise _400("Inactive questions can't be added")
    have = set(db.execute(select(OnlineTestQuestion.question_id).where(OnlineTestQuestion.test_id == t.id)).scalars())
    seq = db.execute(select(func.coalesce(func.max(OnlineTestQuestion.sequence), 0)).where(OnlineTestQuestion.test_id == t.id)).scalar_one()
    by_id = {q.id: q for q in qs}
    added = 0
    for qid in dict.fromkeys(qids):
        if qid in have:
            continue
        seq += 1
        added += 1
        db.add(OnlineTestQuestion(tenant_id=t.tenant_id, school_id=t.school_id, test_id=t.id, question_id=qid,
                                  sequence=seq, marks=marks or by_id[qid].marks))
    db.commit()
    return added


def auto_pick(db: Session, user: User, test_id: int, data: AutoPickIn) -> int:
    """Randomly pick bank questions matching each rule (Bloom/difficulty/chapter/kind)."""
    t, cs = _editable_paper(db, user, test_id)
    taken = set(db.execute(select(OnlineTestQuestion.question_id).where(OnlineTestQuestion.test_id == t.id)).scalars())
    picked: list[int] = []
    short: list[str] = []
    for r in data.rules:
        pool = list(db.execute(
            _question_filter(select(Question.id).where(Question.school_id == t.school_id), None, subject_id=cs.subject_id,
                             bloom_level=r.bloom_level, difficulty=r.difficulty, chapter_id=r.chapter_id, kind=r.kind)
        ).scalars())
        pool = [q for q in pool if q not in taken and q not in picked]
        if len(pool) < r.count:
            label = " / ".join(x.value for x in (r.bloom_level, r.difficulty, r.kind) if x) or "any"
            short.append(f"{label}: need {r.count}, bank has {len(pool)}")
            continue
        picked += random.sample(pool, r.count)
    if short:
        raise _400("Not enough questions in the bank. " + "; ".join(short))
    return add_questions(db, user, test_id, picked, None)


def remove_question(db: Session, user: User, test_id: int, qid: int) -> None:
    t, _ = _editable_paper(db, user, test_id)
    row = db.execute(
        select(OnlineTestQuestion).where(OnlineTestQuestion.test_id == t.id, OnlineTestQuestion.question_id == qid)
    ).scalar_one_or_none()
    if not row:
        raise _404("Question")
    db.delete(row)
    db.flush()
    for i, r in enumerate(db.execute(
        select(OnlineTestQuestion).where(OnlineTestQuestion.test_id == t.id).order_by(OnlineTestQuestion.sequence)
    ).scalars(), start=1):
        r.sequence = i
    db.commit()


def reorder(db: Session, user: User, test_id: int, qids: list[int]) -> None:
    t, _ = _editable_paper(db, user, test_id)
    rows = {r.question_id: r for r in db.execute(select(OnlineTestQuestion).where(OnlineTestQuestion.test_id == t.id)).scalars()}
    if set(qids) != set(rows) or len(qids) != len(rows):
        raise _400("Send every question of this test exactly once")
    for i, qid in enumerate(qids, start=1):
        rows[qid].sequence = i
    db.commit()


def _audience(t: OnlineTest, cs: ClassSubject):
    return (NoticeAudience.section_parents, None, t.section_id) if t.section_id else (NoticeAudience.class_parents, cs.class_id, None)


def publish(db: Session, user: User, test_id: int) -> OnlineTest:
    t, cs = _managed(db, user, test_id)
    if t.status != OnlineTestStatus.draft:
        raise _400("Only drafts can be published")
    if not _test_questions(db, t.id):
        raise _400("Add questions before publishing")
    if t.ends_at <= _now():
        raise _400("The test window has already ended; change the dates first")
    t.status, t.published_at = OnlineTestStatus.published, _now()
    subj = db.get(Subject, cs.subject_id).name
    aud, class_id, section_id = _audience(t, cs)
    notify.broadcast(db, tenant_id=t.tenant_id, school_id=t.school_id, audience=aud, class_id=class_id, section_id=section_id,
                     title=f"Online test: {t.title}",
                     body=f"{subj} test, {t.duration_minutes} minutes. Opens {t.starts_at:%d %b %H:%M} UTC and closes {t.ends_at:%d %b %H:%M} UTC. "
                          "Your child can take it from the parent app.")
    db.commit()
    db.refresh(t)
    return t


def close(db: Session, user: User, test_id: int) -> OnlineTest:
    t, _ = _managed(db, user, test_id)
    if t.status != OnlineTestStatus.published:
        raise _400("Only published tests can be closed")
    t.status = OnlineTestStatus.closed
    for a in db.execute(select(TestAttempt).where(TestAttempt.test_id == t.id, TestAttempt.status == AttemptStatus.in_progress)).scalars():
        _submit(db, a, t, auto=True)
    db.commit()
    db.refresh(t)
    return t


def tests_to_read(db: Session, user: Optional[User], tests: list[OnlineTest]) -> list[dict]:
    if not tests:
        return []
    cs_rows = {
        cs.id: (cs, cname, sname) for cs, cname, sname in db.execute(
            select(ClassSubject, SchoolClass.name, Subject.name)
            .join(SchoolClass, ClassSubject.class_id == SchoolClass.id).join(Subject, ClassSubject.subject_id == Subject.id)
            .where(ClassSubject.id.in_({t.class_subject_id for t in tests}))
        ).all()
    }
    labels = section_labels(db, {t.section_id for t in tests if t.section_id})
    ids = [t.id for t in tests]
    stats = {tid: (n, m) for tid, n, m in db.execute(
        select(OnlineTestQuestion.test_id, func.count(), func.sum(OnlineTestQuestion.marks))
        .where(OnlineTestQuestion.test_id.in_(ids)).group_by(OnlineTestQuestion.test_id)
    ).all()}
    attempts = dict(db.execute(
        select(TestAttempt.test_id, func.count()).where(TestAttempt.test_id.in_(ids)).group_by(TestAttempt.test_id)
    ).all())
    blooms: dict[int, dict] = defaultdict(dict)
    for tid, b, m in db.execute(
        select(OnlineTestQuestion.test_id, Question.bloom_level, func.sum(OnlineTestQuestion.marks))
        .join(Question, OnlineTestQuestion.question_id == Question.id)
        .where(OnlineTestQuestion.test_id.in_(ids)).group_by(OnlineTestQuestion.test_id, Question.bloom_level)
    ).all():
        blooms[tid][b.value] = m
    now = _now()
    out = []
    for t in tests:
        cs, cname, sname = cs_rows[t.class_subject_id]
        n, m = stats.get(t.id, (0, Decimal(0)))
        out.append(dict(
            id=t.id, class_subject_id=t.class_subject_id, class_name=cname, subject_id=cs.subject_id, subject_name=sname, section_id=t.section_id,
            audience_label=labels.get(t.section_id, "") if t.section_id else f"All of {cname}",
            title=t.title, instructions=t.instructions, starts_at=t.starts_at, ends_at=t.ends_at,
            duration_minutes=t.duration_minutes, shuffle_questions=t.shuffle_questions, shuffle_options=t.shuffle_options,
            negative_marking=t.negative_marking, result_visibility=t.result_visibility,
            status=OnlineTestStatus.closed if t.status == OnlineTestStatus.published and now >= t.ends_at else t.status,
            is_open=_is_open(t, now), question_count=n, total_marks=m or Decimal(0), attempts=attempts.get(t.id, 0),
            can_edit=bool(user) and _can_manage(user, cs), by_bloom=blooms.get(t.id, {}),
        ))
    return out


def list_tests(db: Session, user: User, class_subject_id: Optional[int], status_: Optional[OnlineTestStatus]) -> list[dict]:
    stmt = select(OnlineTest).where(OnlineTest.school_id == user.school_id)
    if user.role == UserRole.teacher:
        stmt = stmt.join(ClassSubject, OnlineTest.class_subject_id == ClassSubject.id).where(ClassSubject.teacher_user_id == user.id)
    if class_subject_id:
        stmt = stmt.where(OnlineTest.class_subject_id == class_subject_id)
    if status_:
        stmt = stmt.where(OnlineTest.status == status_)
    return tests_to_read(db, user, list(db.execute(stmt.order_by(OnlineTest.starts_at.desc())).scalars()))


def test_detail(db: Session, user: User, test_id: int) -> dict:
    t, _ = get_test(db, user, test_id)
    d = tests_to_read(db, user, [t])[0]
    rows = _test_questions(db, t.id)
    reads = questions_to_read(db, [q for _, q in rows])
    d["questions"] = [dict(r, test_marks=tq.marks, sequence=tq.sequence) for (tq, _), r in zip(rows, reads)]
    return d


# ---------- grading ----------


def _grade_one(q: Question, marks: Decimal, response: dict, negative: Decimal) -> tuple[Optional[bool], Optional[Decimal]]:
    """(is_correct, marks). Short answers return (None, None) until the teacher grades them."""
    if q.kind == QuestionKind.short:
        text = (response.get("text") or "").strip()
        return (None, None) if text else (False, Decimal(0))
    if q.kind == QuestionKind.numeric:
        v = response.get("value")
        if v is None or v == "":
            return None, Decimal(0)
        try:
            ok = abs(float(v) - float(q.answer["value"])) <= float(q.answer.get("tolerance") or 0) + 1e-9
        except (TypeError, ValueError):
            ok = False
    else:
        keys = response.get("keys") or []
        if not keys:
            return None, Decimal(0)
        ok = sorted(set(keys)) == sorted(q.answer.get("keys") or [])
    if ok:
        return True, marks
    return False, -(marks * negative).quantize(Decimal("0.01"))


def _recompute(db: Session, a: TestAttempt) -> None:
    answers = list(db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == a.id)).scalars())
    pending = sum(1 for x in answers if x.marks_awarded is None)
    total = sum((x.marks_awarded or Decimal(0)) for x in answers)
    a.score = max(total, Decimal(0))
    a.status = AttemptStatus.submitted if pending else AttemptStatus.graded


def _submit(db: Session, a: TestAttempt, t: OnlineTest, auto: bool) -> None:
    if a.status != AttemptStatus.in_progress:
        return
    rows = {tq.question_id: (tq, q) for tq, q in _test_questions(db, t.id)}
    have = {x.question_id: x for x in db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == a.id)).scalars()}
    for qid, (tq, q) in rows.items():
        ans = have.get(qid)
        if not ans:
            ans = AttemptAnswer(tenant_id=a.tenant_id, school_id=a.school_id, attempt_id=a.id, question_id=qid, response={})
            db.add(ans)
        ans.is_correct, ans.marks_awarded = _grade_one(q, tq.marks, ans.response or {}, t.negative_marking)
    db.flush()
    a.submitted_at = min(_now(), a.deadline_at) if auto else _now()
    a.auto_submitted = auto
    _recompute(db, a)


def expire_overdue(db: Session, attempts: list[TestAttempt]) -> None:
    now = _now()
    changed = False
    for a in attempts:
        if a.status == AttemptStatus.in_progress and now > a.deadline_at + GRACE:
            _submit(db, a, db.get(OnlineTest, a.test_id), auto=True)
            changed = True
    if changed:
        db.commit()


def grade_answer(db: Session, user: User, attempt_id: int, question_id: int, data: GradeIn) -> dict:
    a = db.get(TestAttempt, attempt_id)
    if not a or a.school_id != user.school_id:
        raise _404("Attempt")
    t, _ = _managed(db, user, a.test_id)
    expire_overdue(db, [a])
    if a.status == AttemptStatus.in_progress:
        raise _400("The student is still taking this test")
    tq = db.execute(
        select(OnlineTestQuestion).where(OnlineTestQuestion.test_id == t.id, OnlineTestQuestion.question_id == question_id)
    ).scalar_one_or_none()
    ans = db.execute(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == a.id, AttemptAnswer.question_id == question_id)
    ).scalar_one_or_none()
    if not tq or not ans:
        raise _404("Answer")
    if data.marks > tq.marks:
        raise _400(f"This question is worth {tq.marks} marks")
    ans.marks_awarded = data.marks
    ans.is_correct = data.marks == tq.marks
    ans.teacher_comment = data.comment
    _recompute(db, a)
    db.commit()
    return attempt_result(db, a, force_visible=True)


# ---------- results ----------


def _eligible_students(db: Session, t: OnlineTest, cs: ClassSubject) -> list[Student]:
    stmt = select(Student).where(Student.is_active.is_(True))
    if t.section_id:
        stmt = stmt.where(Student.section_id == t.section_id)
    else:
        stmt = stmt.join(Section, Student.section_id == Section.id).where(Section.class_id == cs.class_id)
    return list(db.execute(stmt.order_by(Student.section_id, Student.full_name)).scalars())


def results(db: Session, user: User, test_id: int) -> dict:
    t, cs = get_test(db, user, test_id)
    attempts = list(db.execute(select(TestAttempt).where(TestAttempt.test_id == t.id)).scalars())
    expire_overdue(db, attempts)
    by_student = {a.student_id: a for a in attempts}
    students = _eligible_students(db, t, cs)
    # include students who attempted but have since moved section
    missing = set(by_student) - {s.id for s in students}
    if missing:
        students += list(db.execute(select(Student).where(Student.id.in_(missing))).scalars())
    labels = section_labels(db, {s.section_id for s in students})
    pending = dict(db.execute(
        select(AttemptAnswer.attempt_id, func.count()).where(
            AttemptAnswer.attempt_id.in_([a.id for a in attempts] or [-1]), AttemptAnswer.marks_awarded.is_(None)
        ).group_by(AttemptAnswer.attempt_id)
    ).all())
    rows = []
    for s in students:
        a = by_student.get(s.id)
        done = a and a.status != AttemptStatus.in_progress
        rows.append(dict(
            student_id=s.id, student_name=s.full_name, section_label=labels.get(s.section_id, ""),
            attempt_id=a.id if a else None, status=a.status if a else None, started_at=a.started_at if a else None,
            submitted_at=a.submitted_at if a else None, auto_submitted=bool(a and a.auto_submitted),
            score=a.score if done else None, max_score=a.max_score if a else None,
            percent=_pct(a.score, a.max_score) if done else None, pending_grading=pending.get(a.id, 0) if a else 0,
        ))
    finished = [a for a in attempts if a.status != AttemptStatus.in_progress]
    scores = [a.score for a in finished if a.score is not None]
    tq_rows = _test_questions(db, t.id)
    ans = list(db.execute(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id.in_([a.id for a in finished] or [-1]))
    ).scalars())
    per_q: dict[int, list[AttemptAnswer]] = defaultdict(list)
    for x in ans:
        per_q[x.question_id].append(x)
    questions, bloom_max, bloom_got = [], defaultdict(Decimal), defaultdict(Decimal)
    for tq, q in tq_rows:
        xs = per_q.get(q.id, [])
        graded = [x for x in xs if x.marks_awarded is not None]
        answered = [x for x in xs if x.response]
        correct = sum(1 for x in xs if x.is_correct)
        questions.append(dict(
            question_id=q.id, sequence=tq.sequence, text=q.text, kind=q.kind, bloom_level=q.bloom_level,
            answered=len(answered), correct=correct, percent_correct=_pct(correct, len(xs)) if xs else None,
            avg_marks=(sum(x.marks_awarded for x in graded) / len(graded)).quantize(Decimal("0.01")) if graded else None,
        ))
        bloom_max[q.bloom_level] += tq.marks
        if graded:
            bloom_got[q.bloom_level] += sum(max(x.marks_awarded, Decimal(0)) for x in graded) / len(graded)
    blooms = [
        dict(bloom_level=b, max_marks=bloom_max[b], avg_percent=_pct(bloom_got[b], bloom_max[b]) if finished else None)
        for b in BloomLevel if b in bloom_max
    ]
    return dict(
        test=tests_to_read(db, user, [t])[0], eligible=len(students), attempted=len(finished),
        average_percent=_pct(sum(scores) / len(scores), t_max(finished)) if scores else None,
        highest=max(scores) if scores else None, lowest=min(scores) if scores else None,
        rows=rows, questions=questions, blooms=blooms,
    )


def t_max(attempts: list[TestAttempt]) -> Decimal:
    return attempts[0].max_score if attempts else Decimal(0)


def _visible(t: OnlineTest, a: TestAttempt) -> bool:
    if a.status == AttemptStatus.in_progress:
        return False
    if t.result_visibility == ResultVisibility.on_submit:
        return True
    if t.result_visibility == ResultVisibility.after_close:
        return _is_over(t)
    return False


def attempt_result(db: Session, a: TestAttempt, force_visible: bool = False) -> dict:
    t = db.get(OnlineTest, a.test_id)
    st = db.get(Student, a.student_id)
    visible = force_visible or _visible(t, a)
    d = dict(attempt_id=a.id, test_id=t.id, title=t.title, student_id=st.id, student_name=st.full_name, status=a.status,
             submitted_at=a.submitted_at, auto_submitted=a.auto_submitted, visible=visible)
    if not visible:
        return d
    ans = {x.question_id: x for x in db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == a.id)).scalars()}
    rows = {q.id: (tq, q) for tq, q in _test_questions(db, t.id)}
    order = a.question_order or list(rows)
    qs = []
    for n, qid in enumerate(order, start=1):
        if qid not in rows:
            continue
        tq, q = rows[qid]
        x = ans.get(qid)
        qs.append(dict(
            question_id=qid, number=n, kind=q.kind, text=q.text, options=_ordered_options(q, a), marks=tq.marks,
            response=x.response if x else {}, correct=q.answer, explanation=q.explanation,
            is_correct=x.is_correct if x else None, marks_awarded=x.marks_awarded if x else None,
            teacher_comment=x.teacher_comment if x else None, bloom_level=q.bloom_level,
        ))
    d.update(score=a.score, max_score=a.max_score, percent=_pct(a.score, a.max_score),
             pending_grading=sum(1 for x in ans.values() if x.marks_awarded is None), questions=qs)
    return d


def staff_attempt(db: Session, user: User, attempt_id: int) -> dict:
    a = db.get(TestAttempt, attempt_id)
    if not a or a.school_id != user.school_id:
        raise _404("Attempt")
    get_test(db, user, a.test_id)
    expire_overdue(db, [a])
    if a.status == AttemptStatus.in_progress:
        raise _400("The student is still taking this test")
    return attempt_result(db, a, force_visible=True)


# ---------- taking a test (parent portal) ----------


def _ordered_options(q: Question, a: TestAttempt) -> list[dict]:
    keys = (a.option_order or {}).get(str(q.id))
    if not keys:
        return q.options
    by_key = {o["key"]: o for o in q.options}
    return [by_key[k] for k in keys if k in by_key]


def _child_tests_stmt(st: Student, class_id: int):
    return (
        select(OnlineTest, ClassSubject)
        .join(ClassSubject, OnlineTest.class_subject_id == ClassSubject.id)
        .where(
            OnlineTest.school_id == st.school_id,
            OnlineTest.status.in_([OnlineTestStatus.published, OnlineTestStatus.closed]),
            ClassSubject.class_id == class_id,
            or_(OnlineTest.section_id.is_(None), OnlineTest.section_id == st.section_id),
        )
    )


def child_tests(db: Session, parent_user_id: int, student_id: int) -> list[dict]:
    st = require_linked_child(db, parent_user_id, student_id)
    class_id = db.get(Section, st.section_id).class_id
    rows = db.execute(_child_tests_stmt(st, class_id).order_by(OnlineTest.starts_at.desc())).all()
    tests = [t for t, _ in rows]
    attempts = {a.test_id: a for a in db.execute(
        select(TestAttempt).where(TestAttempt.student_id == st.id, TestAttempt.test_id.in_([t.id for t in tests] or [-1]))
    ).scalars()}
    expire_overdue(db, list(attempts.values()))
    reads = {r["id"]: r for r in tests_to_read(db, None, tests)}
    now = _now()
    out = []
    for t in tests:
        a = attempts.get(t.id)
        r = reads[t.id]
        if a:
            state = "in_progress" if a.status == AttemptStatus.in_progress else "done"
        elif _is_open(t, now):
            state = "open"
        elif now < t.starts_at and t.status == OnlineTestStatus.published:
            state = "upcoming"
        else:
            state = "missed"
        vis = bool(a) and _visible(t, a)
        out.append(dict(
            id=t.id, title=t.title, subject_name=r["subject_name"], student_id=st.id, student_name=st.full_name,
            starts_at=t.starts_at, ends_at=t.ends_at, duration_minutes=t.duration_minutes,
            question_count=r["question_count"], total_marks=r["total_marks"], state=state,
            attempt_id=a.id if a else None, score=a.score if vis else None,
            percent=_pct(a.score, a.max_score) if vis else None, result_visible=vis,
        ))
    return out


def _child_test(db: Session, parent_user_id: int, student_id: int, test_id: int) -> tuple[Student, OnlineTest]:
    st = require_linked_child(db, parent_user_id, student_id)
    class_id = db.get(Section, st.section_id).class_id
    row = db.execute(_child_tests_stmt(st, class_id).where(OnlineTest.id == test_id)).first()
    if not row:
        raise _404("Test")
    return st, row[0]


def _paper(db: Session, a: TestAttempt, t: OnlineTest, st: Student) -> dict:
    rows = {q.id: (tq, q) for tq, q in _test_questions(db, t.id)}
    saved = {x.question_id: x.response for x in db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == a.id)).scalars()}
    qs = []
    for n, qid in enumerate(a.question_order, start=1):
        if qid not in rows:
            continue
        tq, q = rows[qid]
        qs.append(dict(question_id=qid, number=n, kind=q.kind, text=q.text, options=_ordered_options(q, a),
                       marks=tq.marks, response=saved.get(qid, {})))
    left = max(0, int((a.deadline_at - _now()).total_seconds()))
    return dict(attempt_id=a.id, test_id=t.id, title=t.title, instructions=t.instructions, student_id=st.id,
                student_name=st.full_name, deadline_at=a.deadline_at, seconds_left=left, status=a.status, questions=qs)


def start(db: Session, parent_user_id: int, student_id: int, test_id: int) -> dict:
    st, t = _child_test(db, parent_user_id, student_id, test_id)
    existing = db.execute(
        select(TestAttempt).where(TestAttempt.test_id == t.id, TestAttempt.student_id == st.id)
    ).scalar_one_or_none()
    if existing:
        expire_overdue(db, [existing])
        if existing.status != AttemptStatus.in_progress:
            raise _400("This test has already been submitted")
        return _paper(db, existing, t, st)
    if not _is_open(t):
        raise _400("This test isn't open right now")
    rows = _test_questions(db, t.id)
    order = [q.id for _, q in rows]
    if t.shuffle_questions:
        random.shuffle(order)
    opt_order = {}
    if t.shuffle_options:
        for _, q in rows:
            if q.kind in (QuestionKind.single, QuestionKind.multiple):
                keys = [o["key"] for o in q.options]
                random.shuffle(keys)
                opt_order[str(q.id)] = keys
    now = _now()
    a = TestAttempt(
        tenant_id=t.tenant_id, school_id=t.school_id, test_id=t.id, student_id=st.id, started_by_user_id=parent_user_id,
        started_at=now, deadline_at=min(now + timedelta(minutes=t.duration_minutes), t.ends_at),
        question_order=order, option_order=opt_order, max_score=sum((tq.marks for tq, _ in rows), Decimal(0)),
    )
    db.add(a)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        a = db.execute(select(TestAttempt).where(TestAttempt.test_id == t.id, TestAttempt.student_id == st.id)).scalar_one()
    db.refresh(a)
    return _paper(db, a, t, st)


def _own_attempt(db: Session, parent_user_id: int, attempt_id: int) -> tuple[TestAttempt, OnlineTest, Student]:
    a = db.get(TestAttempt, attempt_id)
    if not a:
        raise _404("Attempt")
    st = require_linked_child(db, parent_user_id, a.student_id)
    return a, db.get(OnlineTest, a.test_id), st


def paper(db: Session, parent_user_id: int, attempt_id: int) -> dict:
    a, t, st = _own_attempt(db, parent_user_id, attempt_id)
    expire_overdue(db, [a])
    if a.status != AttemptStatus.in_progress:
        raise _400("This test has been submitted")
    return _paper(db, a, t, st)


def _clean_response(q: Question, r: dict) -> dict:
    if q.kind == QuestionKind.short:
        return {"text": str(r.get("text") or "")[:5000]}
    if q.kind == QuestionKind.numeric:
        v = r.get("value")
        if v in (None, ""):
            return {}
        try:
            return {"value": float(v)}
        except (TypeError, ValueError):
            raise _400(f"Question needs a number")
    keys = r.get("keys") or []
    valid = {o["key"] for o in q.options}
    if not isinstance(keys, list) or any(k not in valid for k in keys):
        raise _400("Unknown option")
    if q.kind != QuestionKind.multiple and len(keys) > 1:
        raise _400("Pick only one option")
    return {"keys": sorted(set(keys))} if keys else {}


def save_answers(db: Session, parent_user_id: int, attempt_id: int, answers: dict[int, dict]) -> dict:
    a, t, st = _own_attempt(db, parent_user_id, attempt_id)
    if a.status != AttemptStatus.in_progress:
        raise _400("This test has been submitted")
    if _now() > a.deadline_at + GRACE:
        expire_overdue(db, [a])
        raise _400("Time is up; the test was submitted automatically")
    qs = {q.id: q for _, q in _test_questions(db, t.id)}
    have = {x.question_id: x for x in db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == a.id)).scalars()}
    for qid, r in answers.items():
        q = qs.get(int(qid))
        if not q:
            raise _400("That question isn't in this test")
        clean = _clean_response(q, r or {})
        x = have.get(q.id)
        if not x:
            x = AttemptAnswer(tenant_id=a.tenant_id, school_id=a.school_id, attempt_id=a.id, question_id=q.id)
            db.add(x)
        x.response = clean
    db.commit()
    return _paper(db, a, t, st)


def submit(db: Session, parent_user_id: int, attempt_id: int) -> dict:
    a, t, _ = _own_attempt(db, parent_user_id, attempt_id)
    if a.status == AttemptStatus.in_progress:
        late = _now() > a.deadline_at + GRACE
        _submit(db, a, t, auto=late)
        db.commit()
    return attempt_result(db, a)


def child_result(db: Session, parent_user_id: int, attempt_id: int) -> dict:
    a, _, _ = _own_attempt(db, parent_user_id, attempt_id)
    expire_overdue(db, [a])
    return attempt_result(db, a)
