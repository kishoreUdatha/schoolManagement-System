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
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import (
    AssetStatus,
    AttendanceStatus,
    BorrowerType,
    CopyStatus,
    CrewRole,
    Gender,
    ParentRelation,
    SubjectKind,
    TransportDirection,
    StockMoveKind,
    UserRole,
    VehicleKind,
)
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.inventory import Asset, InventoryItem, StockMove, Supplier
from app.models.library import Book, BookCopy, LibrarySettings, Loan
from app.models.parent import ParentStudent
from app.models.payroll import PayrollRun
from app.models.plan import Plan, PlanModule
from app.models.staff import Staff
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.subscription import TenantSubscription
from app.models.tenant import School, Tenant
from app.models.timetable import Period, TimetableEntry
from app.models.transport import (
    TransportAssignment,
    TransportCrew,
    TransportRoute,
    TransportStop,
    Vehicle,
)
from app.models.user import User
from app.schemas.payroll import RunPaid, SalaryIn
from app.services import payroll_service

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

# (title, authors, category, how many copies)
BOOKS = [
    ("The Jungle Book", "Rudyard Kipling", "Fiction", 3),
    ("Wings of Fire", "A. P. J. Abdul Kalam", "Biography", 2),
    ("Panchatantra Tales", "Vishnu Sharma", "Folklore", 3),
    ("The Story of My Experiments with Truth", "M. K. Gandhi", "Biography", 2),
    ("Malgudi Days", "R. K. Narayan", "Fiction", 2),
]
ACCESSION_PREFIX = "DEV-"

# (full name, phone, licence number)
DRIVERS = [
    ("Ganesh Kumar", "9845012345", "KA0120190001234"),
    ("Imran Shaikh", "9845067890", "KA0120180005678"),
]

# (name, code, registration, kind, seats, monthly fee, driver, [(stop, pickup)])
# The van seats four and is given five children below — see the note there.
ROUTES = [
    ("North route", "RT-NORTH", "KA-01-AB-1234", VehicleKind.bus, 40, Decimal("1200.00"),
     "Ganesh Kumar", [("Jayanagar", time(7, 10)), ("Banashankari", time(7, 25)),
                      ("Basavanagudi", time(7, 40))]),
    ("South route", "RT-SOUTH", "KA-01-CD-5678", VehicleKind.van, 4, Decimal("900.00"),
     "Imran Shaikh", [("Koramangala", time(7, 15)), ("HSR Layout", time(7, 35))]),
]

SUPPLIER_NAME = "Sri Supplies"
PO_PREFIX = "PO-DEV-"

# (name, sku, category, unit, reorder level, bought, unit cost, issued,
#  sellable, sale price) — markers and handwash end below their reorder
#  level and chalk runs out entirely, so the low-stock warning has something
#  to say without anybody having to arrange it by hand.
STOCK = [
    ("A4 paper", "STA-A4", "Stationery", "ream", Decimal("20"), Decimal("120"),
     Decimal("240.00"), Decimal("40"), False, None),
    ("Whiteboard markers", "STA-MKR", "Stationery", "piece", Decimal("50"), Decimal("200"),
     Decimal("35.00"), Decimal("170"), False, None),
    ("Chalk boxes", "STA-CHK", "Stationery", "box", Decimal("10"), Decimal("60"),
     Decimal("45.00"), Decimal("60"), False, None),
    ("School shirt", "UNI-SHT", "Uniform", "piece", Decimal("25"), Decimal("150"),
     Decimal("320.00"), Decimal("60"), True, Decimal("450.00")),
    ("School trousers", "UNI-TRS", "Uniform", "piece", Decimal("25"), Decimal("140"),
     Decimal("380.00"), Decimal("50"), True, Decimal("520.00")),
    ("Phenyl", "CLN-PHN", "Cleaning", "litre", Decimal("15"), Decimal("80"),
     Decimal("90.00"), Decimal("30"), False, None),
    ("Handwash refill", "CLN-HWS", "Cleaning", "litre", Decimal("20"), Decimal("60"),
     Decimal("110.00"), Decimal("48"), False, None),
    ("Footballs", "SPT-FTB", "Sports", "piece", Decimal("5"), Decimal("18"),
     Decimal("650.00"), Decimal("4"), False, None),
]

# (tag, name, category, status, cost, location)
ASSETS = [
    ("AST-0001", "Projector — Hall", "Electronics", AssetStatus.in_use,
     Decimal("42000.00"), "Assembly hall"),
    ("AST-0002", "Projector — Grade 1 A", "Electronics", AssetStatus.in_use,
     Decimal("38000.00"), "Grade 1 A"),
    ("AST-0003", "Desktop — office", "Computers", AssetStatus.in_use,
     Decimal("55000.00"), "Front office"),
    ("AST-0004", "Desktop — staff room", "Computers", AssetStatus.under_repair,
     Decimal("52000.00"), "Staff room"),
    ("AST-0005", "Laser printer", "Computers", AssetStatus.in_store,
     Decimal("18500.00"), "Main store"),
    ("AST-0006", "Water purifier", "Utilities", AssetStatus.in_use,
     Decimal("24000.00"), "Corridor"),
    ("AST-0007", "Photocopier (old)", "Office", AssetStatus.disposed,
     Decimal("65000.00"), "Disposed"),
]

# Monthly pay by role. Realistic enough that PF and ESI ceilings actually
# bite, which is the part of a payslip most likely to be wrong.
SALARY_BANDS = {
    UserRole.principal: {"basic": Decimal("60000"), "da": Decimal("6000"),
                         "hra": Decimal("24000"), "conveyance": Decimal("2000"),
                         "special": Decimal("5000"), "tds": Decimal("4500")},
    UserRole.teacher: {"basic": Decimal("32000"), "da": Decimal("3200"),
                       "hra": Decimal("12800"), "conveyance": Decimal("1600"),
                       "special": Decimal("2000"), "tds": Decimal("1200")},
    UserRole.accountant: {"basic": Decimal("28000"), "da": Decimal("2800"),
                          "hra": Decimal("11200"), "conveyance": Decimal("1600"),
                          "special": Decimal("1500"), "tds": Decimal("800")},
    UserRole.staff: {"basic": Decimal("18000"), "da": Decimal("1800"),
                     "hra": Decimal("7200"), "conveyance": Decimal("1200"),
                     "special": Decimal("1000"), "tds": Decimal("0")},
}
SALARY_FROM = date(2024, 4, 1)

# One member of staff is left without a salary on purpose. A payroll run
# reports who it had to skip, and a screen where that list is always empty
# hides the one thing it exists to tell you. The payroll smoke test leans on
# this person too.
NO_SALARY = {"ACC001"}

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

        # ---------- a library with books actually out ----------
        settings = db.execute(
            select(LibrarySettings).where(LibrarySettings.school_id == school.id)
        ).scalar_one_or_none()
        if settings is None:
            settings = LibrarySettings(**ids)
            db.add(settings)
            db.flush()
            note(True, "library settings (defaults)")

        copies: list[BookCopy] = []
        fresh_books = 0
        for title, authors, category, n_copies in BOOKS:
            book = db.execute(
                select(Book).where(Book.school_id == school.id, Book.title == title)
            ).scalar_one_or_none()
            if book is None:
                book = Book(**ids, title=title, authors=authors, category=category,
                            language="English")
                db.add(book)
                db.flush()
                fresh_books += 1
            for n in range(1, n_copies + 1):
                accession = f"{ACCESSION_PREFIX}{book.id:03d}-{n}"
                copy = db.execute(
                    select(BookCopy).where(BookCopy.accession_no == accession)
                ).scalar_one_or_none()
                if copy is None:
                    copy = BookCopy(school_id=school.id, book_id=book.id, accession_no=accession,
                                    status=CopyStatus.available, price=Decimal("250.00"),
                                    acquired_on=date.today() - timedelta(days=400))
                    db.add(copy)
                    db.flush()
                copies.append(copy)
        if fresh_books:
            note(True, f"{fresh_books} books, {len(copies)} copies on the shelf")

        # Loans spread back over five months, so the usage report has a shape
        # rather than a spike. Only the two most recent are still out, and they
        # sit with different children: the library's own rule caps a child at
        # max_books_student, and dev data that breaks the rule the app enforces
        # puts the counter into a state the app itself could never produce.
        # One of the two is overdue, so the overdue figure is never zero.
        librarian = users["school@sms.local"]
        borrowers = children[:4]
        still_out = {len(copies) - 1, len(copies) - 2}
        issued = 0
        for n, copy in enumerate(copies):
            if not borrowers:
                break
            if db.execute(
                select(Loan).where(Loan.copy_id == copy.id)
            ).first():
                continue
            child = borrowers[n % len(borrowers)]
            # spread the issues over the last twenty weeks
            issued_on = date.today() - timedelta(days=7 * (len(copies) - n) + 3)
            due_on = issued_on + timedelta(days=settings.loan_days_student)

            if n in still_out:
                returned_on = None
            else:
                # everything older came back, two days before it was due
                returned_on = min(due_on - timedelta(days=2), date.today())

            db.add(Loan(
                **ids, copy_id=copy.id, borrower_type=BorrowerType.student,
                student_id=child.id, issued_on=issued_on, due_on=due_on,
                returned_on=returned_on, issued_by_user_id=librarian.id,
                returned_by_user_id=librarian.id if returned_on else None,
            ))
            copy.status = CopyStatus.available if returned_on else CopyStatus.issued
            issued += 1
        if issued:
            note(True, f"{issued} library loans over the last five months")

        # ---------- two bus routes, one of them oversubscribed ----------
        crew: dict[str, TransportCrew] = {}
        for full_name, phone, licence in DRIVERS:
            person = db.execute(
                select(TransportCrew).where(
                    TransportCrew.school_id == school.id, TransportCrew.full_name == full_name
                )
            ).scalar_one_or_none()
            if person is None:
                person = TransportCrew(**ids, full_name=full_name, role=CrewRole.driver,
                                       phone=phone, license_no=licence,
                                       license_expiry=date.today() + timedelta(days=500))
                db.add(person)
                db.flush()
                note(True, f"driver {full_name}")
            crew[full_name] = person

        routes: dict[str, TransportRoute] = {}
        for name, code, reg, kind, capacity, fee, driver_name, stops in ROUTES:
            vehicle = db.execute(
                select(Vehicle).where(Vehicle.school_id == school.id, Vehicle.registration_no == reg)
            ).scalar_one_or_none()
            if vehicle is None:
                vehicle = Vehicle(**ids, registration_no=reg, kind=kind,
                                  capacity=capacity, label=f"{name} vehicle",
                                  make_model="Tata Starbus",
                                  driver_id=crew[driver_name].id,
                                  insurance_expiry=date.today() + timedelta(days=300),
                                  fitness_expiry=date.today() + timedelta(days=200))
                db.add(vehicle)
                db.flush()
                note(True, f"vehicle {reg} ({capacity} seats)")

            route = db.execute(
                select(TransportRoute).where(
                    TransportRoute.school_id == school.id, TransportRoute.code == code
                )
            ).scalar_one_or_none()
            if route is None:
                route = TransportRoute(**ids, name=name, code=code, vehicle_id=vehicle.id,
                                       monthly_fee=fee, is_active=True)
                db.add(route)
                db.flush()
                note(True, f"route {name}")
            route.vehicle_id = vehicle.id
            routes[code] = route

            for seq, (stop_name, pickup) in enumerate(stops, start=1):
                if db.execute(
                    select(TransportStop).where(
                        TransportStop.route_id == route.id, TransportStop.name == stop_name
                    )
                ).scalar_one_or_none():
                    continue
                db.add(TransportStop(route_id=route.id, name=stop_name, sequence=seq,
                                     pickup_time=pickup,
                                     drop_time=time(pickup.hour + 8, pickup.minute)))

        db.flush()

        # The van is deliberately given five children for its four seats. The
        # utilisation report exists to catch exactly that, and a warning nobody
        # has ever seen fire is a warning nobody trusts.
        riding = 0
        for n, child in enumerate(children):
            code = "RT-SOUTH" if n < 5 else "RT-NORTH"
            route = routes[code]
            if db.execute(
                select(TransportAssignment).where(
                    TransportAssignment.student_id == child.id,
                    TransportAssignment.end_date.is_(None),
                )
            ).scalar_one_or_none():
                continue
            stop = db.execute(
                select(TransportStop).where(TransportStop.route_id == route.id)
                .order_by(TransportStop.sequence)
            ).scalars().first()
            db.add(TransportAssignment(**ids, student_id=child.id, route_id=route.id,
                                       stop_id=stop.id, direction=TransportDirection.both,
                                       start_date=date.today() - timedelta(days=120)))
            riding += 1
        if riding:
            note(True, f"{riding} children on the two routes")

        # ---------- a store with stock actually moving ----------
        storekeeper = admin_user = users["school@sms.local"]
        supplier = db.execute(
            select(Supplier).where(Supplier.school_id == school.id, Supplier.name == SUPPLIER_NAME)
        ).scalar_one_or_none()
        if supplier is None:
            supplier = Supplier(**ids, name=SUPPLIER_NAME, contact_person="Ravi Menon",
                                phone="9845098765", email="sales@srisupplies.dev",
                                gstin="29ABCDE1234F1Z5")
            db.add(supplier)
            db.flush()
            note(True, f"supplier {SUPPLIER_NAME}")

        stocked = 0
        for (name, sku, category, unit, reorder, bought, cost,
             issued, sellable, price) in STOCK:
            item = db.execute(
                select(InventoryItem).where(InventoryItem.school_id == school.id,
                                            InventoryItem.sku == sku)
            ).scalar_one_or_none()
            if item is None:
                item = InventoryItem(**ids, name=name, sku=sku, category=category, unit=unit,
                                     reorder_level=reorder, is_sellable=sellable,
                                     sale_price=price, location="Main store")
                db.add(item)
                db.flush()
            if db.execute(select(StockMove).where(StockMove.item_id == item.id)).first():
                continue

            # Bought once, then drawn down over the term. The purchase carries
            # the unit cost because that is what the valuation is priced on;
            # an issue has no cost of its own.
            db.add(StockMove(**ids, item_id=item.id, kind=StockMoveKind.purchase, qty=bought,
                             unit_cost=cost, moved_on=date.today() - timedelta(days=150),
                             supplier_id=supplier.id, reference=f"{PO_PREFIX}{sku}",
                             recorded_by_user_id=storekeeper.id))
            if issued:
                for part, days in ((issued / 2, 90), (issued - issued / 2, 30)):
                    if part <= 0:
                        continue
                    db.add(StockMove(**ids, item_id=item.id, kind=StockMoveKind.issue, qty=part,
                                     moved_on=date.today() - timedelta(days=days),
                                     issued_to="Staff room",
                                     recorded_by_user_id=storekeeper.id))
            stocked += 1
        if stocked:
            note(True, f"{stocked} stock items with purchases and issues")

        fresh_assets = 0
        for tag, name, category, status, cost, where in ASSETS:
            if db.execute(
                select(Asset).where(Asset.school_id == school.id, Asset.asset_tag == tag)
            ).scalar_one_or_none():
                continue
            db.add(Asset(**ids, asset_tag=tag, name=name, category=category, status=status,
                         cost=cost, location=where, supplier_id=supplier.id,
                         purchase_date=date.today() - timedelta(days=600),
                         warranty_until=date.today() + timedelta(days=200)))
            fresh_assets += 1
        if fresh_assets:
            note(True, f"{fresh_assets} assets on the register")

        # ---------- salaries, and three months of payroll behind them ----------
        staff_rows = db.execute(
            select(Staff, User).join(User, Staff.user_id == User.id)
            .where(Staff.school_id == school.id, User.is_active.is_(True))
            .order_by(Staff.id)
        ).all()

        paid_set = 0
        for n, (st, u) in enumerate(staff_rows):
            if st.employee_no in NO_SALARY:
                continue
            if payroll_service.current_salary(db, st.id, date.today()):
                continue
            band = SALARY_BANDS.get(u.role, SALARY_BANDS[UserRole.staff])
            payroll_service.set_salary(
                db, school.tenant_id, school.id, st.id,
                SalaryIn(
                    effective_from=SALARY_FROM,
                    basic=band["basic"], da=band["da"], hra=band["hra"],
                    conveyance=band["conveyance"], special_allowance=band["special"],
                    pf_applicable=True, esi_applicable=True,
                    professional_tax=Decimal("200.00"), tds_monthly=band["tds"],
                    bank_name="HDFC Bank",
                    bank_account_no=f"5010{st.id:08d}",
                    bank_ifsc="HDFC0001234",
                    pan=f"ABCPD{1000 + n}X",
                    uan=f"{100000000000 + st.id}",
                ),
            )
            paid_set += 1
        if paid_set:
            note(True, f"salary on file for {paid_set} staff")

        # Four months back, so the payroll screen shows a run in each state
        # rather than only the happy ending: two paid, one finalized and one
        # left in draft the way a half-finished month really looks.
        #
        # The current month is deliberately left alone. The payroll smoke test
        # runs against it and refuses to touch a period that already has a real
        # run, which is the right instinct for anything that moves money —
        # seeding over it would make the suite abort rather than pass.
        runs_made = 0
        month = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)
        periods = []
        for _ in range(4):
            periods.append(f"{month:%Y-%m}")
            month = (month - timedelta(days=1)).replace(day=1)
        for n, period in enumerate(reversed(periods)):
            if db.execute(
                select(PayrollRun).where(PayrollRun.school_id == school.id,
                                         PayrollRun.period == period)
            ).scalar_one_or_none():
                continue
            run, skipped = payroll_service.create_run(
                db, school.tenant_id, school.id, admin_user.id, period)
            if n < len(periods) - 1:
                payroll_service.finalize(db, run.id, school.id, admin_user.id)
            if n < len(periods) - 2:
                payroll_service.mark_paid(
                    db, run.id, school.id,
                    RunPaid(paid_on=date(int(period[:4]), int(period[5:]), 28),
                            payment_ref=f"NEFT/{period.replace('-', '')}"))
            runs_made += 1
        if runs_made:
            note(True, f"{runs_made} payroll runs ({periods[-1]} to {periods[0]})")

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
