from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.services import notice_service


def _today_dow() -> int:
    # Python: Mon=0..Sun=6; we use ISO Mon=1..Sun=7
    return date.today().isoweekday()


def build_dashboard(db: Session, teacher_user_id: int, school_id: int) -> dict:
    """Today's-snapshot for a teacher's home page."""
    dow = _today_dow()

    # Today's classes (timetable entries where this teacher is the assigned subject teacher)
    rows = db.execute(
        select(TimetableEntry, Period, Section, SchoolClass, Subject, ClassSubject)
        .join(Period, TimetableEntry.period_id == Period.id)
        .join(Section, TimetableEntry.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .join(ClassSubject, TimetableEntry.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(
            TimetableEntry.school_id == school_id,
            Period.day_of_week == dow,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
        .order_by(Period.period_number)
    ).all()

    todays_classes = [
        {
            "period_id": p.id,
            "period_number": p.period_number,
            "start_time": p.start_time.strftime("%H:%M"),
            "end_time": p.end_time.strftime("%H:%M"),
            "section_id": sec.id,
            "section_label": f"{cls.name} {sec.name}",
            "subject_name": subj.name,
            "subject_code": subj.code,
            "is_break": p.is_break,
        }
        for entry, p, sec, cls, subj, cs in rows
    ]

    # Sections this teacher is the class teacher of
    sections_rows = db.execute(
        select(Section, SchoolClass)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(
            Section.school_id == school_id,
            Section.class_teacher_user_id == teacher_user_id,
        )
        .order_by(SchoolClass.display_order, SchoolClass.name, Section.name)
    ).all()
    class_teacher_of = [
        {
            "section_id": sec.id,
            "section_label": f"{cls.name} {sec.name}",
            "class_id": cls.id,
            "capacity": sec.capacity,
        }
        for sec, cls in sections_rows
    ]

    unread = notice_service.unread_count(db, teacher_user_id)

    return {
        "today_iso_date": date.today().isoformat(),
        "today_day_of_week": dow,
        "todays_classes": todays_classes,
        "class_teacher_of": class_teacher_of,
        "unread_notices": unread,
        "generated_at": datetime.now(timezone.utc),
    }


def _section_student_count(db: Session, section_id: int) -> int:
    return db.execute(
        select(func.count(Student.id)).where(
            Student.section_id == section_id, Student.is_active.is_(True)
        )
    ).scalar_one()


def list_my_classes(db: Session, teacher_user_id: int, school_id: int) -> dict:
    """All sections and class-subjects this teacher is assigned to."""
    # Class teacher of (sections)
    sec_rows = db.execute(
        select(Section, SchoolClass, AcademicYear)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .join(AcademicYear, SchoolClass.academic_year_id == AcademicYear.id)
        .where(
            Section.school_id == school_id,
            Section.class_teacher_user_id == teacher_user_id,
        )
        .order_by(SchoolClass.display_order, SchoolClass.name, Section.name)
    ).all()
    class_teacher_of = [
        {
            "section_id": sec.id,
            "class_id": cls.id,
            "section_name": sec.name,
            "class_name": cls.name,
            "section_label": f"{cls.name} {sec.name}",
            "academic_year_id": year.id,
            "academic_year_name": year.name,
            "is_current_year": year.is_current,
            "capacity": sec.capacity,
            "student_count": _section_student_count(db, sec.id),
        }
        for sec, cls, year in sec_rows
    ]

    # Subject teacher of (class_subjects). One row per class-subject.
    cs_rows = db.execute(
        select(ClassSubject, Subject, SchoolClass, AcademicYear)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
        .join(AcademicYear, SchoolClass.academic_year_id == AcademicYear.id)
        .where(
            ClassSubject.school_id == school_id,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
        .order_by(SchoolClass.display_order, SchoolClass.name, Subject.name)
    ).all()
    subject_teacher_of = []
    for cs, subj, cls, year in cs_rows:
        # Total students across all sections of this class
        sections = db.execute(
            select(Section).where(Section.class_id == cls.id)
        ).scalars().all()
        section_briefs = [
            {
                "section_id": s.id,
                "section_name": s.name,
                "student_count": _section_student_count(db, s.id),
            }
            for s in sections
        ]
        subject_teacher_of.append(
            {
                "class_subject_id": cs.id,
                "class_id": cls.id,
                "class_name": cls.name,
                "subject_id": subj.id,
                "subject_name": subj.name,
                "subject_code": subj.code,
                "is_optional": cs.is_optional,
                "academic_year_id": year.id,
                "academic_year_name": year.name,
                "is_current_year": year.is_current,
                "sections": section_briefs,
                "total_students": sum(s["student_count"] for s in section_briefs),
            }
        )

    return {
        "class_teacher_of": class_teacher_of,
        "subject_teacher_of": subject_teacher_of,
    }


def teacher_can_access_section(
    db: Session, teacher_user_id: int, section_id: int, school_id: int
) -> Section:
    """Return Section if teacher has rights, raise 403/404 otherwise."""
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )

    # Class teacher access
    if sec.class_teacher_user_id == teacher_user_id:
        return sec

    # Subject teacher access — does this teacher teach any subject in this class?
    teaches = db.execute(
        select(ClassSubject.id).where(
            ClassSubject.class_id == sec.class_id,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
    ).first()
    if teaches:
        return sec

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You don't have access to this section",
    )


def list_section_students(
    db: Session, teacher_user_id: int, section_id: int, school_id: int
) -> list[dict]:
    teacher_can_access_section(db, teacher_user_id, section_id, school_id)
    rows = db.execute(
        select(Student).where(
            Student.section_id == section_id,
            Student.is_active.is_(True),
        ).order_by(Student.roll_no, Student.full_name)
    ).scalars().all()
    return [
        {
            "id": s.id,
            "admission_no": s.admission_no,
            "roll_no": s.roll_no,
            "full_name": s.full_name,
            "gender": s.gender.value if s.gender else None,
            "dob": s.dob.isoformat() if s.dob else None,
            "photo_url": s.photo_url,
        }
        for s in rows
    ]
