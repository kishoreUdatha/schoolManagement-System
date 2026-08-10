from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import NoticeAudience, NoticeChannel
from app.models.academic import Section
from app.models.notice import Notice
from app.models.student import Student
from app.models.subject import ClassSubject
from app.schemas.notice import NoticeCreate
from app.services import notice_service


def _teacher_class_ids(db: Session, teacher_user_id: int) -> set[int]:
    """All class_ids where this teacher teaches at least one subject."""
    rows = db.execute(
        select(ClassSubject.class_id)
        .where(ClassSubject.teacher_user_id == teacher_user_id)
        .distinct()
    ).all()
    return {row[0] for row in rows}


def _check_audience_allowed_for_teacher(
    db: Session,
    teacher_user_id: int,
    school_id: int,
    audience: NoticeAudience,
    class_id: Optional[int],
    section_id: Optional[int],
    student_id: Optional[int],
) -> None:
    if audience not in (
        NoticeAudience.class_parents,
        NoticeAudience.section_parents,
        NoticeAudience.single_parent,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teachers can only message parents of their own classes",
        )

    teacher_classes = _teacher_class_ids(db, teacher_user_id)

    if audience == NoticeAudience.class_parents:
        if class_id not in teacher_classes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't teach this class",
            )
    elif audience == NoticeAudience.section_parents:
        sec = db.get(Section, section_id)
        if not sec or sec.school_id != school_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
            )
        if sec.class_id not in teacher_classes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't teach this section's class",
            )
    elif audience == NoticeAudience.single_parent:
        st = db.get(Student, student_id)
        if not st or st.school_id != school_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
            )
        section = db.get(Section, st.section_id)
        if not section or section.class_id not in teacher_classes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't teach this student's class",
            )


def create_and_send(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    data: NoticeCreate,
) -> Notice:
    # Force in-app only for MVP teacher notices
    data.channels = [NoticeChannel.in_app]
    # Teachers don't get to schedule for later — send immediately
    data.scheduled_at = None

    _check_audience_allowed_for_teacher(
        db,
        teacher_user_id,
        school_id,
        data.audience,
        data.audience_class_id,
        data.audience_section_id,
        data.audience_student_id,
    )
    n = notice_service.create(db, tenant_id, school_id, teacher_user_id, data)
    # Send immediately — single in-app channel
    notice_service.send(db, n.id, school_id)
    db.refresh(n)
    return n


def list_for_teacher(
    db: Session, teacher_user_id: int, school_id: int, limit: int = 50
) -> list[Notice]:
    return list(
        db.execute(
            select(Notice)
            .where(
                Notice.school_id == school_id,
                Notice.created_by_user_id == teacher_user_id,
            )
            .order_by(Notice.created_at.desc())
            .limit(limit)
        ).scalars().all()
    )
