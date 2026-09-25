from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.enums import BehaviourPeriodKind
from app.models.academic import SchoolClass, Section
from app.models.behaviour import BehaviourRating
from app.models.student import Student
from app.models.user import User


def current_period_key(kind: BehaviourPeriodKind, on: Optional[date] = None) -> str:
    d = on or date.today()
    if kind == BehaviourPeriodKind.weekly:
        return d.strftime("%G-W%V")
    return d.strftime("%Y-%m")


def _section_label(db: Session, section_id: int) -> Optional[str]:
    sec = db.get(Section, section_id)
    if not sec:
        return None
    cls = db.get(SchoolClass, sec.class_id)
    return f"{cls.name} {sec.name}" if cls else sec.name


def _to_read_dict(db: Session, r: BehaviourRating) -> dict:
    student = db.get(Student, r.student_id)
    rater = db.get(User, r.rated_by_user_id) if r.rated_by_user_id else None
    avg = round(
        (r.punctuality + r.participation + r.discipline + r.respect) / 4, 2
    )
    return {
        "id": r.id,
        "student_id": r.student_id,
        "student_name": student.full_name if student else None,
        "rated_by_user_id": r.rated_by_user_id,
        "rated_by_name": rater.full_name if rater else None,
        "period_kind": r.period_kind,
        "period_key": r.period_key,
        "punctuality": r.punctuality,
        "participation": r.participation,
        "discipline": r.discipline,
        "respect": r.respect,
        "average": avg,
        "teacher_note": r.teacher_note,
        "ai_suggested": r.ai_suggested,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def _check_class_teacher_for_student(
    db: Session, teacher_user_id: int, student_id: int, school_id: int
) -> Student:
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    sec = db.get(Section, student.section_id)
    if not sec or sec.class_teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the class teacher of this student's section can rate behaviour",
        )
    return student


def save(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    student_id: int,
    period_kind: BehaviourPeriodKind,
    period_key: Optional[str],
    punctuality: int,
    participation: int,
    discipline: int,
    respect: int,
    teacher_note: Optional[str],
    ai_suggested: Optional[dict] = None,
) -> BehaviourRating:
    _check_class_teacher_for_student(db, teacher_user_id, student_id, school_id)
    pk = period_key or current_period_key(period_kind)

    # UPSERT
    stmt = (
        pg_insert(BehaviourRating.__table__)
        .values(
            tenant_id=tenant_id,
            school_id=school_id,
            student_id=student_id,
            rated_by_user_id=teacher_user_id,
            period_kind=period_kind.value,
            period_key=pk,
            punctuality=punctuality,
            participation=participation,
            discipline=discipline,
            respect=respect,
            teacher_note=teacher_note,
            ai_suggested=ai_suggested,
        )
        .on_conflict_do_update(
            constraint="uq_behaviour_per_student_period",
            set_={
                "punctuality": punctuality,
                "participation": participation,
                "discipline": discipline,
                "respect": respect,
                "teacher_note": teacher_note,
                "ai_suggested": ai_suggested,
                "rated_by_user_id": teacher_user_id,
            },
        )
    )
    db.execute(stmt)
    db.commit()
    # Fetch the row back so we can return it
    rec = db.execute(
        select(BehaviourRating).where(
            BehaviourRating.student_id == student_id,
            BehaviourRating.period_kind == period_kind.value,
            BehaviourRating.period_key == pk,
        )
    ).scalar_one()
    return rec


def list_for_student(
    db: Session, student_id: int, school_id: int
) -> list[BehaviourRating]:
    return list(
        db.execute(
            select(BehaviourRating)
            .where(
                BehaviourRating.student_id == student_id,
                BehaviourRating.school_id == school_id,
            )
            .order_by(BehaviourRating.period_key.desc())
        ).scalars().all()
    )


def section_view(
    db: Session,
    teacher_user_id: int,
    school_id: int,
    section_id: int,
    period_kind: BehaviourPeriodKind,
    period_key: Optional[str] = None,
) -> dict:
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    if sec.class_teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the class teacher of this section can rate behaviour",
        )

    pk = period_key or current_period_key(period_kind)

    students = db.execute(
        select(Student)
        .where(Student.section_id == section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.full_name)
    ).scalars().all()

    ratings = db.execute(
        select(BehaviourRating).where(
            BehaviourRating.student_id.in_([s.id for s in students]),
            BehaviourRating.period_kind == period_kind.value,
            BehaviourRating.period_key == pk,
        )
    ).scalars().all()
    by_student = {r.student_id: r for r in ratings}

    rows = []
    for s in students:
        rec = by_student.get(s.id)
        rows.append(
            {
                "student_id": s.id,
                "admission_no": s.admission_no,
                "roll_no": s.roll_no,
                "full_name": s.full_name,
                "rating": _to_read_dict(db, rec) if rec else None,
            }
        )

    return {
        "section_id": section_id,
        "section_label": _section_label(db, section_id),
        "period_kind": period_kind,
        "period_key": pk,
        "rows": rows,
    }


def list_for_child(
    db: Session, parent_user_id: int, student_id: int
) -> list[BehaviourRating]:
    from app.models.parent import ParentStudent

    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )
    return list(
        db.execute(
            select(BehaviourRating)
            .where(BehaviourRating.student_id == student_id)
            .order_by(BehaviourRating.period_key.desc())
        ).scalars().all()
    )


# ----- AI suggest fallback (used when Claude is not configured; see app/ai) -----

POSITIVE_WORDS = (
    "excellent", "great", "good", "polite", "punctual", "active",
    "helpful", "attentive", "respectful", "engaged", "improved",
)
NEGATIVE_WORDS = (
    "late", "disrupt", "rude", "absent", "distracted",
    "noisy", "incomplete", "miss", "fail", "fighting", "bullying",
)


def ai_suggest_stub(note: str) -> dict:
    """Heuristic suggestion used when the Claude API is unavailable.

    Counts positive/negative cue words and biases all 4 dimensions accordingly.
    """
    text = note.lower()
    pos = sum(1 for w in POSITIVE_WORDS if w in text)
    neg = sum(1 for w in NEGATIVE_WORDS if w in text)
    base = 3 + min(pos, 2) - min(neg, 2)
    base = max(1, min(5, base))
    rationale = (
        f"Heuristic stub — counted {pos} positive cue(s) and {neg} negative cue(s) "
        f"in the note, so all dimensions suggested at {base}/5. "
        "Set ANTHROPIC_API_KEY on the server for AI suggestions."
    )
    return {
        "punctuality": base,
        "participation": base,
        "discipline": base,
        "respect": base,
        "rationale": rationale,
        "source": "stub",
    }
