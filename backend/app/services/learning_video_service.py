from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.academic import SchoolClass, Section
from app.models.learning_video import LearningVideo, LearningVideoCompletion
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User
from app.schemas.learning_video import (
    LearningVideoCreate,
    LearningVideoUpdate,
    extract_video_id,
)


def _eligible_student_count(db: Session, video: LearningVideo) -> int:
    cs = db.get(ClassSubject, video.class_subject_id)
    if not cs:
        return 0
    return db.execute(
        select(func.count(Student.id))
        .join(Section, Student.section_id == Section.id)
        .where(
            Section.class_id == cs.class_id,
            Student.is_active.is_(True),
        )
    ).scalar_one()


def _completion_count(db: Session, video_id: int) -> int:
    return db.execute(
        select(func.count(LearningVideoCompletion.id)).where(
            LearningVideoCompletion.video_id == video_id
        )
    ).scalar_one()


def _completion_for_student(
    db: Session, video_id: int, student_id: int
) -> Optional[LearningVideoCompletion]:
    return db.execute(
        select(LearningVideoCompletion).where(
            LearningVideoCompletion.video_id == video_id,
            LearningVideoCompletion.student_id == student_id,
        )
    ).scalar_one_or_none()


def _to_read_dict(
    db: Session, v: LearningVideo, *, student_id: Optional[int] = None
) -> dict:
    cs = db.get(ClassSubject, v.class_subject_id)
    subject = db.get(Subject, cs.subject_id) if cs else None
    cls = db.get(SchoolClass, cs.class_id) if cs else None
    teacher = db.get(User, v.teacher_user_id) if v.teacher_user_id else None

    is_completed: Optional[bool] = None
    completed_at = None
    if student_id is not None:
        c = _completion_for_student(db, v.id, student_id)
        is_completed = c is not None
        completed_at = c.marked_at if c else None

    return {
        "id": v.id,
        "class_subject_id": v.class_subject_id,
        "subject_name": subject.name if subject else None,
        "subject_code": subject.code if subject else None,
        "class_name": cls.name if cls else None,
        "title": v.title,
        "description": v.description,
        "youtube_video_id": v.youtube_video_id,
        "youtube_url": v.youtube_url,
        "thumbnail_url": f"https://img.youtube.com/vi/{v.youtube_video_id}/mqdefault.jpg",
        "embed_url": f"https://www.youtube.com/embed/{v.youtube_video_id}",
        "teacher_user_id": v.teacher_user_id,
        "teacher_name": teacher.full_name if teacher else None,
        "is_active": v.is_active,
        "created_at": v.created_at,
        "completion_count": _completion_count(db, v.id),
        "eligible_student_count": _eligible_student_count(db, v),
        "is_completed": is_completed,
        "completed_at": completed_at,
    }


def _check_teacher_owns_cs(
    db: Session, teacher_user_id: int, class_subject_id: int, school_id: int
) -> ClassSubject:
    cs = db.get(ClassSubject, class_subject_id)
    if not cs or cs.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class-subject not found"
        )
    if cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this subject in this class",
        )
    return cs


def create_for_teacher(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    data: LearningVideoCreate,
) -> LearningVideo:
    _check_teacher_owns_cs(db, teacher_user_id, data.class_subject_id, school_id)
    video_id = extract_video_id(data.youtube_url)
    # Validator already guaranteed video_id is not None, but be defensive
    assert video_id is not None

    v = LearningVideo(
        tenant_id=tenant_id,
        school_id=school_id,
        class_subject_id=data.class_subject_id,
        teacher_user_id=teacher_user_id,
        title=data.title,
        description=(data.description or "").strip() or None,
        youtube_video_id=video_id,
        youtube_url=data.youtube_url,
        is_active=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def list_for_teacher(
    db: Session,
    teacher_user_id: int,
    school_id: int,
    class_subject_id: Optional[int] = None,
) -> list[LearningVideo]:
    stmt = (
        select(LearningVideo)
        .where(
            LearningVideo.school_id == school_id,
            LearningVideo.teacher_user_id == teacher_user_id,
            LearningVideo.is_active.is_(True),
        )
        .order_by(LearningVideo.created_at.desc())
    )
    if class_subject_id:
        stmt = stmt.where(LearningVideo.class_subject_id == class_subject_id)
    return list(db.execute(stmt).scalars().all())


def get(db: Session, video_id: int, school_id: int) -> LearningVideo:
    v = db.get(LearningVideo, video_id)
    if not v or v.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    return v


def update_for_teacher(
    db: Session,
    video_id: int,
    school_id: int,
    teacher_user_id: int,
    data: LearningVideoUpdate,
) -> LearningVideo:
    v = get(db, video_id, school_id)
    if v.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this can edit it",
        )
    if not v.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video has been removed",
        )

    updates = data.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"] is not None:
        v.title = updates["title"].strip()
    if "description" in updates:
        desc = updates["description"]
        v.description = (desc or "").strip() or None if desc is not None else None
    if "youtube_url" in updates and updates["youtube_url"]:
        new_id = extract_video_id(updates["youtube_url"])
        assert new_id is not None
        v.youtube_url = updates["youtube_url"]
        v.youtube_video_id = new_id

    db.commit()
    db.refresh(v)
    return v


def delete_for_teacher(
    db: Session, video_id: int, school_id: int, teacher_user_id: int
) -> None:
    v = get(db, video_id, school_id)
    if v.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this can delete it",
        )
    v.is_active = False
    db.commit()


# ----- Parent -----

def list_for_child(
    db: Session, parent_user_id: int, student_id: int
) -> list[LearningVideo]:
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
    student = db.get(Student, student_id)
    if not student:
        return []
    section = db.get(Section, student.section_id)
    if not section:
        return []
    cs_ids = list(
        db.execute(
            select(ClassSubject.id).where(ClassSubject.class_id == section.class_id)
        ).scalars().all()
    )
    if not cs_ids:
        return []
    rows = db.execute(
        select(LearningVideo)
        .where(
            LearningVideo.school_id == student.school_id,
            LearningVideo.class_subject_id.in_(cs_ids),
            LearningVideo.is_active.is_(True),
        )
        .order_by(LearningVideo.created_at.desc())
    ).scalars().all()
    return list(rows)


# ----- School admin (moderation) -----

def list_for_admin(
    db: Session,
    school_id: int,
    *,
    class_subject_id: Optional[int] = None,
    include_removed: bool = False,
) -> list[LearningVideo]:
    stmt = (
        select(LearningVideo)
        .where(LearningVideo.school_id == school_id)
        .order_by(LearningVideo.created_at.desc())
    )
    if class_subject_id:
        stmt = stmt.where(LearningVideo.class_subject_id == class_subject_id)
    if not include_removed:
        stmt = stmt.where(LearningVideo.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def admin_delete(db: Session, video_id: int, school_id: int) -> None:
    v = get(db, video_id, school_id)
    v.is_active = False
    db.commit()


# ----- Story 15.2 — Completions -----

def _verify_parent_owns_child(
    db: Session, parent_user_id: int, student_id: int
) -> Student:
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
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return student


def _verify_video_for_student(
    db: Session, video: LearningVideo, student: Student
) -> None:
    cs = db.get(ClassSubject, video.class_subject_id)
    section = db.get(Section, student.section_id)
    if not cs or not section or cs.class_id != section.class_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This video is not for your child's class",
        )


def parent_mark_completed(
    db: Session,
    parent_user_id: int,
    student_id: int,
    video_id: int,
) -> LearningVideoCompletion:
    student = _verify_parent_owns_child(db, parent_user_id, student_id)
    video = db.get(LearningVideo, video_id)
    if not video or not video.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    _verify_video_for_student(db, video, student)

    existing = _completion_for_student(db, video_id, student_id)
    if existing:
        return existing  # idempotent — already marked
    c = LearningVideoCompletion(
        tenant_id=video.tenant_id,
        school_id=video.school_id,
        video_id=video_id,
        student_id=student_id,
        marked_by_user_id=parent_user_id,
        marked_at=datetime.now(timezone.utc),
    )
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _completion_for_student(db, video_id, student_id)
        if existing:
            return existing
        raise
    db.refresh(c)
    return c


def parent_unmark_completed(
    db: Session, parent_user_id: int, student_id: int, video_id: int
) -> None:
    _verify_parent_owns_child(db, parent_user_id, student_id)
    existing = _completion_for_student(db, video_id, student_id)
    if not existing:
        return
    db.delete(existing)
    db.commit()


def teacher_completion_roster(
    db: Session, video_id: int, teacher_user_id: int, school_id: int
) -> dict:
    v = get(db, video_id, school_id)
    if v.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this video can view its completions",
        )
    cs = db.get(ClassSubject, v.class_subject_id)
    if not cs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class-subject not found"
        )
    # All active students in the class (all sections), with completion timestamp
    rows = db.execute(
        select(Student, Section, SchoolClass, LearningVideoCompletion.marked_at)
        .join(Section, Student.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .outerjoin(
            LearningVideoCompletion,
            (LearningVideoCompletion.student_id == Student.id)
            & (LearningVideoCompletion.video_id == video_id),
        )
        .where(
            Section.class_id == cs.class_id,
            Student.is_active.is_(True),
        )
        .order_by(Section.name, Student.roll_no, Student.full_name)
    ).all()

    roster = []
    completed = 0
    for student, section, cls_, completed_at in rows:
        roster.append(
            {
                "student_id": student.id,
                "admission_no": student.admission_no,
                "roll_no": student.roll_no,
                "full_name": student.full_name,
                "section_label": f"{cls_.name} {section.name}",
                "completed": completed_at is not None,
                "completed_at": completed_at,
            }
        )
        if completed_at is not None:
            completed += 1

    return {
        "video_id": video_id,
        "completion_count": completed,
        "eligible_student_count": len(roster),
        "rows": roster,
    }
