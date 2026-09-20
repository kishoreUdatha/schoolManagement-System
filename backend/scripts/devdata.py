"""Where the smoke tests look up the dev fixture.

The tests used to hard-code primary keys (school 2, section 1, student 1),
which only held on the one laptop where that data happened to land in that
order. They ask here instead, by the names scripts/seed_dev_data.py seeds, so
the suite runs against any database that has been seeded.

    from scripts import devdata
    ids = devdata.school()            # {"tenant_id": .., "school_id": ..}
    section = devdata.section("A")    # Grade 1 A
    aarav = devdata.child()           # the child Sharma is father to
"""
from __future__ import annotations

from sqlalchemy import select

from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject
from app.models.tenant import School, Tenant
from app.models.user import User

TENANT_CODE = "DEVSCHOOL"
CLASS_NAME = "Grade 1"
CHILD_NAME = "Aarav Sharma"
OTHER_CHILD_NAME = "Ishaan Verma"  # nobody's parent is linked to this one
TEACHER_EMAIL = "iyer@dev.local"
PARENT_EMAIL = "sharma@dev.local"
CURRENT_YEAR = "2025-26"
NEXT_YEAR = "2026-27"


class NotSeeded(RuntimeError):
    """Raised with what to run, rather than a bare lookup failure."""

    def __init__(self, what: str):
        super().__init__(
            f"{what} is missing — run: docker exec sms-backend python -m scripts.seed_dev_data"
        )


def _one(stmt, what: str):
    db = SessionLocal()
    try:
        row = db.execute(stmt).scalars().first()
        if row is None:
            raise NotSeeded(what)
        return row
    finally:
        db.close()


def school() -> dict:
    """tenant_id / school_id of the dev school, ready to splat into a model."""
    tenant = _one(select(Tenant).where(Tenant.code == TENANT_CODE), f"tenant {TENANT_CODE}")
    s = _one(select(School).where(School.tenant_id == tenant.id), "the dev school")
    return {"tenant_id": tenant.id, "school_id": s.id}


def school_id() -> int:
    return school()["school_id"]


def today():
    """Today in the school's timezone — the same date the API will use.

    Not `date.today()`. The containers run on UTC and the dev school is in
    Asia/Kolkata, so from 18:30 UTC the server is already on tomorrow's date
    while `date.today()` is still on yesterday's. Tests that mixed the two
    passed all morning and failed every evening.

    It calls the application's own helper rather than naming a timezone here,
    so a test can never disagree with the endpoint it is checking.
    """
    from app.core.scoping import school_today

    db = SessionLocal()
    try:
        return school_today(db, school_id())
    finally:
        db.close()


def year_id(name: str = CURRENT_YEAR) -> int:
    return _one(
        select(AcademicYear).where(
            AcademicYear.school_id == school_id(), AcademicYear.name == name
        ),
        f"academic year {name}",
    ).id



def class_subject_ids() -> list[int]:
    """Every subject the dev class is taught, oldest first.

    A test that needs two papers needs two subjects, because a paper is
    unique per subject within an exam.
    """
    class_id = klass().id
    db = SessionLocal()
    try:
        ids = list(db.execute(
            select(ClassSubject.id)
            .where(ClassSubject.class_id == class_id)
            .order_by(ClassSubject.id)
        ).scalars())
    finally:
        db.close()
    if not ids:
        raise NotSeeded(f"subjects for {CLASS_NAME}")
    return ids

def klass() -> SchoolClass:
    return _one(
        select(SchoolClass).where(
            SchoolClass.school_id == school_id(), SchoolClass.name == CLASS_NAME
        ),
        f"class {CLASS_NAME}",
    )


def section_id(label: str = "A") -> int:
    return _one(
        select(Section).where(Section.class_id == klass().id, Section.name == label),
        f"section {CLASS_NAME} {label}",
    ).id


def child_id(name: str = CHILD_NAME) -> int:
    return _one(
        select(Student).where(Student.school_id == school_id(), Student.full_name == name),
        f"student {name}",
    ).id


def other_child_id() -> int:
    """A child the dev parent is NOT linked to — the 'someone else's child' case."""
    return child_id(OTHER_CHILD_NAME)


def class_subject_id() -> int:
    """The one class-subject the dev teacher owns (Maths in Grade 1)."""
    teacher = _one(select(User).where(User.email == TEACHER_EMAIL), f"teacher {TEACHER_EMAIL}")
    return _one(
        select(ClassSubject).where(
            ClassSubject.class_id == klass().id, ClassSubject.teacher_user_id == teacher.id
        ),
        f"a class-subject taught by {TEACHER_EMAIL}",
    ).id


def user_id(email: str) -> int:
    return _one(select(User).where(User.email == email), f"user {email}").id


def parent_links() -> list[int]:
    """Children the dev parent can see."""
    db = SessionLocal()
    try:
        return list(db.execute(
            select(ParentStudent.student_id).where(
                ParentStudent.parent_user_id == user_id(PARENT_EMAIL)
            )
        ).scalars())
    finally:
        db.close()
