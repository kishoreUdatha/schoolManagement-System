"""Decisions the school makes about a result that the marks don't say:
withholding it, passing by grace, or failing a child for malpractice.

The marks stay untouched — this sits on top of the computed result, carries the
reason, and bumps a version each time it changes so a corrected result is never
swapped silently. Withholding shows the parent the school's note instead of the
marks; staff always see the numbers, flagged.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import ResultStatus
from app.models.exam import Exam
from app.models.result_override import ExamResultOverride
from app.models.student import Student
from app.models.user import User
from app.schemas.result import OverrideIn, OverrideUpdate
from app.services import result_service


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def get(db: Session, override_id: int, school_id: int) -> ExamResultOverride:
    o = db.get(ExamResultOverride, override_id)
    if not o or o.school_id != school_id:
        raise _404("Result decision")
    return o


def to_read(db: Session, rows: list[ExamResultOverride]) -> list[dict]:
    if not rows:
        return []
    students = {s.id: s for s in db.execute(
        select(Student).where(Student.id.in_({r.student_id for r in rows}))
    ).scalars()}
    exams = {e.id: e for e in db.execute(
        select(Exam).where(Exam.id.in_({r.exam_id for r in rows}))
    ).scalars()}
    names = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({r.decided_by_user_id for r in rows if r.decided_by_user_id}))
    ).all()) if any(r.decided_by_user_id for r in rows) else {}
    return [{
        "id": r.id,
        "exam_id": r.exam_id,
        "exam_name": exams[r.exam_id].name if r.exam_id in exams else None,
        "student_id": r.student_id,
        "student_name": students[r.student_id].full_name if r.student_id in students else None,
        "student_admission_no": students[r.student_id].admission_no if r.student_id in students else None,
        "result_status": r.result_status,
        "reason": r.reason,
        "parent_note": r.parent_note,
        "version_no": r.version_no,
        "decided_by_name": names.get(r.decided_by_user_id),
        "decided_at": r.decided_at,
    } for r in rows]


def list_for_exam(db: Session, school_id: int, exam_id: Optional[int] = None,
                  student_id: Optional[int] = None) -> list[dict]:
    stmt = select(ExamResultOverride).where(ExamResultOverride.school_id == school_id)
    if exam_id:
        stmt = stmt.where(ExamResultOverride.exam_id == exam_id)
    if student_id:
        stmt = stmt.where(ExamResultOverride.student_id == student_id)
    return to_read(db, list(db.execute(stmt.order_by(ExamResultOverride.id.desc())).scalars()))


def create(db: Session, user: User, data: OverrideIn) -> ExamResultOverride:
    exam = db.get(Exam, data.exam_id)
    if not exam or exam.school_id != user.school_id:
        raise _404("Exam")
    student = db.get(Student, data.student_id)
    if not student or student.school_id != user.school_id:
        raise _404("Student")
    if db.execute(
        select(ExamResultOverride.id).where(
            ExamResultOverride.exam_id == exam.id, ExamResultOverride.student_id == student.id
        ).limit(1)
    ).first():
        raise _400(f"{student.full_name} already has a decision on this exam — change that one instead")
    if data.result_status == ResultStatus.normal:
        raise _400("A decision has to say something other than normal")
    o = ExamResultOverride(
        tenant_id=user.tenant_id, school_id=user.school_id, exam_id=exam.id, student_id=student.id,
        result_status=data.result_status, reason=data.reason.strip(), parent_note=data.parent_note,
        decided_by_user_id=user.id, decided_at=datetime.now(timezone.utc),
    )
    db.add(o)
    db.commit()
    return o


def update(db: Session, user: User, override_id: int, data: OverrideUpdate) -> Optional[ExamResultOverride]:
    """Change a decision, or lift it entirely by setting it back to normal."""
    o = get(db, override_id, user.school_id)
    if data.expected_version is not None and data.expected_version != o.version_no:
        raise _400("Someone else changed this decision while you were looking at it — reload and try again")
    fields = data.model_dump(exclude_unset=True, exclude={"expected_version"})
    if fields.get("result_status") == ResultStatus.normal:
        db.delete(o)
        db.commit()
        return None
    for k, v in fields.items():
        setattr(o, k, v.strip() if isinstance(v, str) else v)
    o.version_no += 1
    o.decided_by_user_id = user.id
    o.decided_at = datetime.now(timezone.utc)
    db.commit()
    return o


def delete(db: Session, user: User, override_id: int) -> None:
    o = get(db, override_id, user.school_id)
    db.delete(o)
    db.commit()


def result_for(db: Session, school_id: int, exam_id: int, student_id: int) -> dict:
    """The computed result with the school's decision folded in (staff view)."""
    return result_service.build_student_result_for_admin(db, school_id, student_id, exam_id)
