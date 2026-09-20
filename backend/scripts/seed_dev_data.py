"""Seed the dev school with the data the smoke tests expect.

seed_dev_school.py gives you a tenant, a school and one admin login. That is
enough to open the app, but not enough to exercise it: the smoke tests assume a
school that already has years, a class with two sections, subjects taught by a
known teacher, children with a parent attached, and some attendance behind it.

This fills that in on top of whatever is already there. It is safe to run
again — every record is looked up by name first, so ids stay put between runs,
and re-running it after the suite puts back what the destructive tests moved.

Run:
    docker exec sms-backend python -m scripts.seed_dev_data

What you get (tenant DEVSCHOOL):

    Logins      school@sms.local / SchoolPass123!        (school admin)
                iyer@dev.local / TeacherPass123!         (teacher, Grade 1 A)
                sharma@dev.local / ParentPass123!        (parent of Aarav)
                principal@dev.local / PrincipalPass123!
                accountant@dev.local / AccountantPass123!
                admin@sms.local / ChangeMe123!           (super admin)

    Years       2025-26 (current, where the children sit) and 2026-27
    Classes     Grade 1 with sections A and B
    Subjects    Mathematics (Iyer), English and Science (the other teacher)
    Children    six in Grade 1 A, one in B; Sharma is father to the first two
    History     a fortnight of attendance for Grade 1 A
    Timetable   Mon-Fri, five teaching periods and a lunch break

A few shapes here are load-bearing for the suite rather than arbitrary:
Iyer teaches exactly one subject (a test looks his up with scalar_one), the
fourth child has no parent linked (it is the "someone else's child" 404 case),
Grade 1 A keeps at least five children, and the children sit in an earlier year
than 2026-27 so the promotion test has somewhere to promote them to.
"""
from __future__ import annotations

import sys
from datetime import date, time, timedelta

from sqlalchemy import select

from app.core.enums import AttendanceStatus, Gender, ParentRelation, SubjectKind, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.parent import ParentStudent
from app.models.plan import Plan, PlanModule
from app.models.staff import Staff
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.subscription import TenantSubscription
from app.models.tenant import School, Tenant
from app.models.timetable import Period, TimetableEntry
from app.models.user import User

TENANT_CODE = "DEVSCHOOL"

# (email, password, role, full name, employee_no or None for non-staff)
PEOPLE = [
    ("iyer@dev.local", "TeacherPass123!", UserRole.teacher, "Lakshmi Iyer", "EMP010"),
    ("principal@dev.local", "PrincipalPass123!", UserRole.principal, "Priya Menon", "EMP011"),
    ("accountant@dev.local", "AccountantPass123!", UserRole.accountant, "Suresh Pillai", "EMP012"),
    ("sharma@dev.local", "ParentPass123!", UserRole.parent, "Rahul Sharma", None),
]

# the children sit in 2025-26; 2026-27 is what the promotion test moves them into
YEARS = [
    ("2025-26", date(2025, 6, 1), date(2026, 4, 30)),
    ("2026-27", date(2026, 6, 1), date(2027, 4, 30)),
]
CURRENT_YEAR = "2025-26"

# (name, code, who teaches it) — Iyer must own exactly one, see the docstring
SUBJECTS = [
    ("Mathematics", "MATH", "iyer@dev.local"),
    ("English", "ENG", "teacher@sms.local"),
    ("Science", "SCI", "teacher@sms.local"),
]

# (name, section, gender, dob, parent to link) — order matters: the fourth
# child is the one no parent is linked to
CHILDREN = [
    ("Aarav Sharma", "A", Gender.male, date(2018, 5, 12), "sharma@dev.local"),
    ("Diya Patel", "A", Gender.female, date(2018, 8, 3), "sharma@dev.local"),
    ("Kabir Rao", "A", Gender.male, date(2018, 11, 21), None),
    ("Ishaan Verma", "B", Gender.male, date(2018, 2, 9), None),
    ("Meera Nair", "A", Gender.female, date(2018, 7, 30), None),
    ("Rohan Gupta", "A", Gender.male, date(2018, 9, 17), None),
    ("Ananya Reddy", "A", Gender.female, date(2018, 12, 4), None),
]

# (period number, start, end, label, is a break)
PERIODS = [
    (1, time(8, 30), time(9, 15), "Period 1", False),
    (2, time(9, 15), time(10, 0), "Period 2", False),
    (3, time(10, 15), time(11, 0), "Period 3", False),
    (4, time(11, 0), time(11, 45), "Period 4", False),
    (5, time(11, 45), time(12, 30), "Lunch break", True),
    (6, time(12, 30), time(13, 15), "Period 5", False),
]

ATTENDANCE_DAYS = 14  # of history, so the promotion test has something to carry

made: list[str] = []
kept: list[str] = []


def note(new: bool, what: str) -> None:
    (made if new else kept).append(what)


def main() -> int:
    db = SessionLocal()
    try:
        tenant = db.execute(select(Tenant).where(Tenant.code == TENANT_CODE)).scalar_one_or_none()
        if not tenant:
            print(f"No {TENANT_CODE} tenant — run scripts.seed_dev_school first.", file=sys.stderr)
            return 2
        school = db.execute(select(School).where(School.tenant_id == tenant.id)).scalar_one()
        ids = {"tenant_id": tenant.id, "school_id": school.id}
        print(f"Seeding {school.name} (tenant {tenant.id}, school {school.id})\n")

        # ---------- people ----------
        sa = db.execute(select(User).where(User.role == UserRole.super_admin)).scalars().first()
        if sa:
            # the super admin test signs in with this and never resets it itself
            sa.password_hash = hash_password("ChangeMe123!")
            sa.is_active = True
            note(False, f"super admin {sa.email}, password set to ChangeMe123!")

        users: dict[str, User] = {}
        for u in db.execute(select(User).where(User.school_id == school.id)).scalars():
            users[u.email] = u
        if "school@sms.local" in users:
            users["school@sms.local"].password_hash = hash_password("SchoolPass123!")

        for email, password, role, name, employee_no in PEOPLE:
            u = users.get(email)
            new = u is None
            if new:
                u = User(**ids, email=email, full_name=name, role=role, is_active=True,
                         password_hash=hash_password(password))
                db.add(u)
                db.flush()
                users[email] = u
            else:
                u.password_hash = hash_password(password)
                u.full_name = name  # the school already has a "Dev Principal"; keep them distinct
                u.is_active = True
            note(new, f"{role.value} {email}")
            if employee_no and not db.execute(
                select(Staff).where(Staff.user_id == u.id)
            ).scalar_one_or_none():
                db.add(Staff(**ids, user_id=u.id, employee_no=employee_no,
                             designation=role.value.replace("_", " ").title(),
                             joining_date=date(2024, 6, 1)))
                note(True, f"staff record {employee_no} for {email}")

        teacher = users["iyer@dev.local"]

        # ---------- years ----------
        years: dict[str, AcademicYear] = {}
        for name, start, end in YEARS:
            y = db.execute(
                select(AcademicYear).where(AcademicYear.school_id == school.id, AcademicYear.name == name)
            ).scalar_one_or_none()
            new = y is None
            if new:
                y = AcademicYear(**ids, name=name, start_date=start, end_date=end)
                db.add(y)
                db.flush()
            y.is_archived = False
            years[name] = y
            note(new, f"academic year {name}")
        for name, y in years.items():
            y.is_current = name == CURRENT_YEAR
        db.flush()

        # ---------- class and its two sections ----------
        cls = db.execute(
            select(SchoolClass).where(
                SchoolClass.school_id == school.id, SchoolClass.name == "Grade 1",
                SchoolClass.academic_year_id == years[CURRENT_YEAR].id,
            )
        ).scalar_one_or_none()
        new = cls is None
        if new:
            cls = SchoolClass(**ids, academic_year_id=years[CURRENT_YEAR].id, name="Grade 1", display_order=1)
            db.add(cls)
            db.flush()
        note(new, f"class Grade 1 ({CURRENT_YEAR})")

        sections: dict[str, Section] = {}
        for label in ("A", "B"):
            sec = db.execute(
                select(Section).where(Section.class_id == cls.id, Section.name == label)
            ).scalar_one_or_none()
            if sec is None and label == "A":
                # the bare seed leaves an empty section behind; make it Grade 1 A
                # rather than stranding it, so the child already in it keeps its id
                spare = db.execute(
                    select(Section).where(Section.school_id == school.id).order_by(Section.id).limit(1)
                ).scalar_one_or_none()
                if spare is not None:
                    spare.class_id, spare.name = cls.id, label
                    sec = spare
                    note(False, f"section {spare.id} moved into Grade 1 as A")
            if sec is None:
                sec = Section(**ids, class_id=cls.id, name=label, capacity=40)
                db.add(sec)
                db.flush()
                note(True, f"section Grade 1 {label}")
            sec.capacity = max(sec.capacity or 0, 40)
            sections[label] = sec
        sections["A"].class_teacher_user_id = teacher.id
        db.flush()

        # ---------- subjects ----------
        class_subjects: list[ClassSubject] = []
        for order, (name, code, teaches) in enumerate(SUBJECTS, start=1):
            subject = db.execute(
                select(Subject).where(Subject.school_id == school.id, Subject.code == code)
            ).scalar_one_or_none()
            new = subject is None
            if new:
                subject = Subject(**ids, name=name, code=code, kind=SubjectKind.core,
                                  display_order=order, is_active=True)
                db.add(subject)
                db.flush()
            note(new, f"subject {name}")

            cs = db.execute(
                select(ClassSubject).where(
                    ClassSubject.class_id == cls.id, ClassSubject.subject_id == subject.id
                )
            ).scalar_one_or_none()
            new = cs is None
            if new:
                cs = ClassSubject(**ids, class_id=cls.id, subject_id=subject.id, display_order=order)
                db.add(cs)
                db.flush()
            owner = users.get(teaches)
            cs.teacher_user_id = owner.id if owner else None
            class_subjects.append(cs)
            note(new, f"Grade 1 {name} taught by {owner.full_name if owner else 'nobody yet'}")

        # nothing else may be pinned on Iyer, or the timetable test's lookup breaks
        for stray in db.execute(
            select(ClassSubject).where(
                ClassSubject.school_id == school.id, ClassSubject.teacher_user_id == teacher.id,
                ClassSubject.id.notin_([class_subjects[0].id]),
            )
        ).scalars():
            stray.teacher_user_id = users.get("teacher@sms.local").id if "teacher@sms.local" in users else None
            note(False, f"class-subject {stray.id} taken off Iyer (he teaches Maths only)")

        # ---------- children ----------
        spares = [
            s for s in db.execute(
                select(Student).where(Student.school_id == school.id).order_by(Student.id)
            ).scalars()
            if s.full_name not in {c[0] for c in CHILDREN}
        ]
        rolls = {"A": 0, "B": 0}
        children: list[Student] = []
        for name, label, gender, dob, parent_email in CHILDREN:
            child = db.execute(
                select(Student).where(Student.school_id == school.id, Student.full_name == name)
            ).scalar_one_or_none()
            new = False
            if child is None and spares:
                # reuse the placeholder child the bare seed created, so Aarav is student 1
                child = spares.pop(0)
                child.full_name = name
                note(False, f"{name} (was {'a placeholder child'})")
            if child is None:
                nth = len(children) + 1
                child = Student(**ids, admission_no=f"ADM{nth:04d}", full_name=name,
                                academic_year_id=years[CURRENT_YEAR].id, section_id=sections[label].id,
                                roll_no=nth)
                db.add(child)
                db.flush()
                new = True
                note(True, f"student {name}")
            rolls[label] += 1
            child.gender, child.dob = gender, dob
            child.section_id, child.roll_no = sections[label].id, rolls[label]
            child.academic_year_id = years[CURRENT_YEAR].id
            child.is_active = True
            children.append(child)

            parent = users.get(parent_email) if parent_email else None
            if parent and not db.execute(
                select(ParentStudent).where(
                    ParentStudent.parent_user_id == parent.id, ParentStudent.student_id == child.id
                )
            ).scalar_one_or_none():
                db.add(ParentStudent(**ids, parent_user_id=parent.id, student_id=child.id,
                                     relation=ParentRelation.father))
                note(True, f"{parent.full_name} linked to {name}")
        db.flush()

        # ---------- a fortnight of attendance for Grade 1 A ----------
        in_a = [c for c in children if c.section_id == sections["A"].id]
        marked = 0
        day = date.today()
        for _ in range(ATTENDANCE_DAYS):
            day -= timedelta(days=1)
            while day.weekday() >= 5:  # school doesn't sit at the weekend
                day -= timedelta(days=1)
            for i, child in enumerate(in_a):
                if db.execute(
                    select(StudentAttendance).where(
                        StudentAttendance.student_id == child.id, StudentAttendance.date == day
                    )
                ).scalar_one_or_none():
                    continue
                # one child away roughly every other week, so the numbers aren't flat
                away = (i + day.toordinal()) % 9 == 0
                db.add(StudentAttendance(
                    **ids, student_id=child.id, section_id=sections["A"].id, date=day,
                    status=AttendanceStatus.absent if away else AttendanceStatus.present,
                    marked_by_user_id=teacher.id,
                ))
                marked += 1
        if marked:
            note(True, f"{marked} attendance rows over the last {ATTENDANCE_DAYS} school days")

        # ---------- period grid and Grade 1 A's timetable ----------
        grid: dict[tuple[int, int], Period] = {}
        fresh_periods = 0
        for weekday in range(1, 6):  # Monday to Friday
            for number, start, end, label, is_break in PERIODS:
                p = db.execute(
                    select(Period).where(
                        Period.school_id == school.id, Period.day_of_week == weekday,
                        Period.period_number == number,
                    )
                ).scalar_one_or_none()
                if p is None:
                    p = Period(**ids, day_of_week=weekday, period_number=number, start_time=start,
                               end_time=end, label=label, is_break=is_break)
                    db.add(p)
                    db.flush()
                    fresh_periods += 1
                grid[(weekday, number)] = p
        if fresh_periods:
            note(True, f"{fresh_periods} periods (Mon-Fri)")

        slots = 0
        teaching = [p[0] for p in PERIODS if not p[4]]
        for weekday in range(1, 6):
            for i, number in enumerate(teaching):
                period = grid[(weekday, number)]
                if db.execute(
                    select(TimetableEntry).where(
                        TimetableEntry.section_id == sections["A"].id,
                        TimetableEntry.period_id == period.id,
                    )
                ).scalar_one_or_none():
                    continue
                db.add(TimetableEntry(**ids, section_id=sections["A"].id, period_id=period.id,
                                      class_subject_id=class_subjects[i % len(class_subjects)].id))
                slots += 1
        if slots:
            note(True, f"{slots} timetable slots for Grade 1 A")

        # ---------- leave the super admin test somewhere it can run again ----------
        premium = db.execute(select(Plan).where(Plan.name == "Premium")).scalar_one_or_none()
        if premium:
            subscribed = db.execute(
                select(TenantSubscription.id).where(TenantSubscription.plan_id == premium.id).limit(1)
            ).first()
            if subscribed:
                note(False, "plan Premium left alone — a tenant is on it")
            else:
                db.execute(PlanModule.__table__.delete().where(PlanModule.plan_id == premium.id))
                db.delete(premium)
                note(False, "left-over Premium plan removed so the super admin test can run again")

        db.commit()

        print(f"Added {len(made)}:")
        for line in made:
            print(f"  + {line}")
        print(f"\nAlready there {len(kept)}:")
        for line in kept:
            print(f"  = {line}")
        print("\nDone.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
