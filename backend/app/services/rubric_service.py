"""Marking rubrics, and marking a homework submission against one.

A rubric is a reusable list of criteria with points. A teacher attaches one to
a homework assignment; when they review a submission they can put a mark on
each criterion, and the total is worked out from those rather than typed in.

Rubrics are school-wide (any teacher can reuse one), but only the school admin
or whoever wrote it can change it once it has been used for marking.
"""
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.models.homework import Homework, HomeworkSubmission
from app.models.rubric import Rubric, RubricCriterion, RubricScore
from app.models.subject import Subject
from app.models.user import User
from app.schemas.rubric import CriterionIn, RubricIn, RubricUpdate, ScoreIn


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _403(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)


def get(db: Session, rubric_id: int, school_id: int) -> Rubric:
    r = db.get(Rubric, rubric_id)
    if not r or r.school_id != school_id:
        raise _404("Rubric")
    return r


def _may_edit(user: User, r: Rubric) -> bool:
    return user.role == UserRole.school_admin or r.created_by_user_id == user.id


def _check_edit(db: Session, user: User, r: Rubric) -> None:
    if not _may_edit(user, r):
        raise _403("Only the school admin or whoever wrote this rubric can change it")


def _in_use(db: Session, rubric_id: int) -> bool:
    return db.execute(
        select(Homework.id).where(Homework.rubric_id == rubric_id).limit(1)
    ).first() is not None


def _name_taken(db: Session, school_id: int, name: str, ignore_id: Optional[int] = None) -> bool:
    stmt = select(Rubric.id).where(Rubric.school_id == school_id, func.lower(Rubric.name) == name.lower())
    if ignore_id:
        stmt = stmt.where(Rubric.id != ignore_id)
    return db.execute(stmt.limit(1)).first() is not None


def _criteria(db: Session, rubric_ids: list[int]) -> dict[int, list[RubricCriterion]]:
    out: dict[int, list[RubricCriterion]] = {i: [] for i in rubric_ids}
    if not rubric_ids:
        return out
    rows = db.execute(
        select(RubricCriterion).where(RubricCriterion.rubric_id.in_(rubric_ids))
        .order_by(RubricCriterion.rubric_id, RubricCriterion.sequence, RubricCriterion.id)
    ).scalars()
    for c in rows:
        out[c.rubric_id].append(c)
    return out


def to_read(db: Session, rubrics: list[Rubric]) -> list[dict]:
    if not rubrics:
        return []
    crit = _criteria(db, [r.id for r in rubrics])
    subjects = dict(db.execute(
        select(Subject.id, Subject.name).where(Subject.id.in_({r.subject_id for r in rubrics if r.subject_id}))
    ).all()) if any(r.subject_id for r in rubrics) else {}
    names = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({r.created_by_user_id for r in rubrics if r.created_by_user_id}))
    ).all()) if any(r.created_by_user_id for r in rubrics) else {}
    used = {rid for (rid,) in db.execute(
        select(Homework.rubric_id).where(Homework.rubric_id.in_([r.id for r in rubrics])).distinct()
    )}
    return [{
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "subject_id": r.subject_id,
        "subject_name": subjects.get(r.subject_id) if r.subject_id else None,
        "created_by_name": names.get(r.created_by_user_id),
        "is_active": r.is_active,
        "in_use": r.id in used,
        "max_total": float(sum(Decimal(str(c.max_points)) for c in crit.get(r.id, []))),
        "criteria": [{
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "max_points": float(c.max_points),
            "sequence": c.sequence,
        } for c in crit.get(r.id, [])],
    } for r in rubrics]


def list_rubrics(db: Session, school_id: int, subject_id: Optional[int] = None,
                 include_inactive: bool = False) -> list[dict]:
    stmt = select(Rubric).where(Rubric.school_id == school_id)
    if subject_id:
        stmt = stmt.where(Rubric.subject_id == subject_id)
    if not include_inactive:
        stmt = stmt.where(Rubric.is_active.is_(True))
    return to_read(db, list(db.execute(stmt.order_by(Rubric.name)).scalars()))


def create(db: Session, user: User, data: RubricIn) -> Rubric:
    name = data.name.strip()
    if _name_taken(db, user.school_id, name):
        raise _400(f"A rubric called {name} already exists")
    if data.subject_id:
        s = db.get(Subject, data.subject_id)
        if not s or s.school_id != user.school_id:
            raise _404("Subject")
    r = Rubric(tenant_id=user.tenant_id, school_id=user.school_id, name=name, description=data.description,
               subject_id=data.subject_id, created_by_user_id=user.id)
    db.add(r)
    db.flush()
    for i, c in enumerate(data.criteria, start=1):
        db.add(RubricCriterion(tenant_id=r.tenant_id, school_id=r.school_id, rubric_id=r.id,
                               title=c.title.strip()[:200], description=c.description,
                               max_points=c.max_points, sequence=i))
    db.commit()
    return r


def update(db: Session, user: User, rubric_id: int, data: RubricUpdate) -> Rubric:
    r = get(db, rubric_id, user.school_id)
    _check_edit(db, user, r)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("name"):
        name = fields["name"].strip()
        if _name_taken(db, user.school_id, name, ignore_id=r.id):
            raise _400(f"A rubric called {name} already exists")
        fields["name"] = name
    for k, v in fields.items():
        setattr(r, k, v)
    db.commit()
    return r


def delete(db: Session, user: User, rubric_id: int) -> None:
    r = get(db, rubric_id, user.school_id)
    _check_edit(db, user, r)
    if _in_use(db, r.id):
        raise _400("This rubric is attached to homework; retire it instead of deleting it")
    db.delete(r)
    db.commit()


# ---------- criteria ----------


def _criterion(db: Session, criterion_id: int, user: User) -> tuple[RubricCriterion, Rubric]:
    c = db.get(RubricCriterion, criterion_id)
    if not c or c.school_id != user.school_id:
        raise _404("Criterion")
    return c, get(db, c.rubric_id, user.school_id)


def _check_not_marked(db: Session, criterion_ids: list[int]) -> None:
    if criterion_ids and db.execute(
        select(RubricScore.id).where(RubricScore.criterion_id.in_(criterion_ids)).limit(1)
    ).first():
        raise _400("Work has already been marked against this rubric; make a new one instead")


def add_criterion(db: Session, user: User, rubric_id: int, data: CriterionIn) -> RubricCriterion:
    r = get(db, rubric_id, user.school_id)
    _check_edit(db, user, r)
    existing = [c.id for c in _criteria(db, [r.id])[r.id]]
    _check_not_marked(db, existing)
    seq = db.execute(
        select(func.coalesce(func.max(RubricCriterion.sequence), 0)).where(RubricCriterion.rubric_id == r.id)
    ).scalar_one()
    c = RubricCriterion(tenant_id=r.tenant_id, school_id=r.school_id, rubric_id=r.id, title=data.title.strip()[:200],
                        description=data.description, max_points=data.max_points, sequence=seq + 1)
    db.add(c)
    db.commit()
    return c


def update_criterion(db: Session, user: User, criterion_id: int, data: CriterionIn) -> RubricCriterion:
    c, r = _criterion(db, criterion_id, user)
    _check_edit(db, user, r)
    _check_not_marked(db, [c.id])
    c.title, c.description, c.max_points = data.title.strip()[:200], data.description, data.max_points
    db.commit()
    return c


def delete_criterion(db: Session, user: User, criterion_id: int) -> None:
    c, r = _criterion(db, criterion_id, user)
    _check_edit(db, user, r)
    _check_not_marked(db, [c.id])
    db.delete(c)
    db.commit()


# ---------- marking a submission ----------


def scores_for(db: Session, submission_ids: list[int]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {i: [] for i in submission_ids}
    if not submission_ids:
        return out
    rows = list(db.execute(
        select(RubricScore, RubricCriterion)
        .join(RubricCriterion, RubricCriterion.id == RubricScore.criterion_id)
        .where(RubricScore.submission_id.in_(submission_ids))
        .order_by(RubricCriterion.sequence, RubricCriterion.id)
    ))
    for sc, crit in rows:
        out[sc.submission_id].append({
            "criterion_id": crit.id,
            "criterion_title": crit.title,
            "max_points": float(crit.max_points),
            "points": float(sc.points),
            "comment": sc.comment,
        })
    return out


def marking_for(db: Session, submission_id: int) -> Optional[dict]:
    """The marks on one submission, plus the rubric it was marked against."""
    sub = db.get(HomeworkSubmission, submission_id)
    if not sub:
        return None
    hw = db.get(Homework, sub.homework_id)
    if not hw or not hw.rubric_id:
        return None
    r = db.get(Rubric, hw.rubric_id)
    crit = _criteria(db, [r.id])[r.id]
    scored = {s["criterion_id"]: s for s in scores_for(db, [submission_id])[submission_id]}
    return {
        "rubric_id": r.id,
        "rubric_name": r.name,
        "max_total": float(sum(Decimal(str(c.max_points)) for c in crit)),
        "total": float(sum(Decimal(str(s["points"])) for s in scored.values())) if scored else None,
        "criteria": [{
            "criterion_id": c.id,
            "criterion_title": c.title,
            "description": c.description,
            "max_points": float(c.max_points),
            "points": scored.get(c.id, {}).get("points"),
            "comment": scored.get(c.id, {}).get("comment"),
        } for c in crit],
    }


def set_scores(db: Session, user: User, submission_id: int, scores: list[ScoreIn]) -> dict:
    sub = db.get(HomeworkSubmission, submission_id)
    if not sub or sub.school_id != user.school_id:
        raise _404("Submission")
    hw = db.get(Homework, sub.homework_id)
    if not hw.rubric_id:
        raise _400("This homework isn't marked against a rubric")
    crit = {c.id: c for c in _criteria(db, [hw.rubric_id])[hw.rubric_id]}
    if not crit:
        raise _400("That rubric has no criteria yet")
    unknown = {s.criterion_id for s in scores} - set(crit)
    if unknown:
        raise _400("Those criteria aren't part of this homework's rubric")
    existing = {s.criterion_id: s for s in db.execute(
        select(RubricScore).where(RubricScore.submission_id == submission_id)
    ).scalars()}
    for s in scores:
        c = crit[s.criterion_id]
        if s.points > float(c.max_points):
            raise _400(f"{c.title} is out of {float(c.max_points):g}")
        row = existing.get(s.criterion_id)
        if row:
            row.points, row.comment, row.scored_by_user_id = s.points, s.comment, user.id
        else:
            db.add(RubricScore(tenant_id=sub.tenant_id, school_id=sub.school_id, submission_id=submission_id,
                               criterion_id=s.criterion_id, points=s.points, comment=s.comment,
                               scored_by_user_id=user.id))
    db.commit()
    return marking_for(db, submission_id)
