"""Small lookups shared by the ERP modules (transport, library, hostel, ...)."""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.academic import SchoolClass, Section
from app.models.parent import ParentStudent
from app.models.student import Student


def get_school_student(db: Session, student_id: int, school_id: int) -> Student:
    s = db.get(Student, student_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s


def require_linked_child(db: Session, parent_user_id: int, student_id: int) -> Student:
    """The student, but only if this parent is linked to them (404 otherwise)."""
    student = db.execute(
        select(Student)
        .join(ParentStudent, ParentStudent.student_id == Student.id)
        .where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not found or not linked to this parent",
        )
    return student


def section_labels(db: Session, section_ids: set[int]) -> dict[int, str]:
    """{section_id: "Class 1 A"} in one query."""
    if not section_ids:
        return {}
    rows = db.execute(
        select(Section.id, Section.name, SchoolClass.name)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(Section.id.in_(section_ids))
    ).all()
    return {sid: f"{cname} {sname}" for sid, sname, cname in rows}


def section_label(db: Session, section_id: Optional[int]) -> Optional[str]:
    if section_id is None:
        return None
    return section_labels(db, {section_id}).get(section_id)


def school_today(db: Session, school_id: int):
    """Today's date in the school's timezone."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.models.tenant import School

    s = db.get(School, school_id)
    return datetime.now(ZoneInfo(s.timezone if s and s.timezone else "Asia/Kolkata")).date()
