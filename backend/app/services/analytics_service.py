"""The numbers behind the reports.

Every module already answers "what happened" for its own records. This answers
"how are we doing" across them: how full the school is, who is slipping, what
was collected against what was owed, which subject the whole class struggled
with.

Two rules hold throughout. Nothing here writes, so a report can never damage
what it reports on. And nothing here scores a person — the teacher view counts
what somebody did, not how well they did it, because a number that pretends to
rank teachers will be used as though it could.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import Numeric, case, cast, func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    AssetStatus,
    AttendanceStatus,
    BoardingStatus,
    TripDirection,
    FeeStatus,
    MarkStatus,
    StaffAttendanceStatus,
    StockMoveKind,
    UserRole,
)
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.accounts import FeeCollection
from app.models.attendance import StudentAttendance
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, StudentFee
from app.models.homework import Homework
from app.models.inventory import Asset, InventoryItem, StockMove
from app.models.library import Book, BookCopy, Loan
from app.models.mark import Mark
from app.models.notice import Notice, NoticeRecipient
from app.models.staff import Staff
from app.models.staff_attendance import StaffAttendance
from app.models.staff_ops import ClassroomObservation
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.syllabus import SyllabusChapter, SyllabusTopic, TopicCoverage
from app.models.transport import (
    TransportAssignment,
    TransportRoute,
    TransportStop,
    Trip,
    TripBoarding,
    Vehicle,
)
from app.models.user import User

ZERO = Decimal("0")


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _months_back(n: int) -> list[str]:
    today = date.today().replace(day=1)
    out = []
    for _ in range(n):
        out.append(f"{today:%Y-%m}")
        today = (today - timedelta(days=1)).replace(day=1)
    return list(reversed(out))


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


# ---------- the school at a glance ----------


def overview(db: Session, school_id: int, months: int = 6) -> dict:
    """What a head asks on a Monday: how many, how present, how much in."""
    students = db.execute(
        select(func.count(Student.id)).where(Student.school_id == school_id, Student.is_active.is_(True))
    ).scalar_one()
    staff = db.execute(
        select(func.count(User.id)).where(
            User.school_id == school_id, User.is_active.is_(True),
            User.role.in_([UserRole.teacher, UserRole.staff, UserRole.principal, UserRole.accountant]),
        )
    ).scalar_one()

    window = _months_back(months)
    first = date(int(window[0][:4]), int(window[0][5:]), 1)

    # attendance by month, late counted present and half-days as half
    att_rows = db.execute(
        select(
            func.to_char(StudentAttendance.date, "YYYY-MM").label("month"),
            StudentAttendance.status,
            func.count(StudentAttendance.id),
        )
        .where(StudentAttendance.school_id == school_id, StudentAttendance.date >= first)
        .group_by("month", StudentAttendance.status)
    ).all()
    att: dict[str, dict] = {m: {"month": m, "present": 0, "absent": 0, "late": 0, "half_day": 0} for m in window}
    for month, st, n in att_rows:
        if month in att:
            att[month][st.value] = n
    for m in att.values():
        marked = m["present"] + m["absent"] + m["late"] + m["half_day"]
        m["percent"] = _pct(m["present"] + m["late"] + 0.5 * m["half_day"], marked)

    # money in by month, against what fell due in the same month
    coll_rows = db.execute(
        select(
            func.to_char(FeeCollection.collected_on, "YYYY-MM").label("month"),
            func.coalesce(func.sum(FeeCollection.amount), 0),
        )
        .where(FeeCollection.school_id == school_id, FeeCollection.collected_on >= first)
        .group_by("month")
    ).all()
    due_rows = db.execute(
        select(
            func.to_char(StudentFee.due_date, "YYYY-MM").label("month"),
            func.coalesce(func.sum(StudentFee.amount_due), 0),
        )
        .where(StudentFee.school_id == school_id, StudentFee.due_date >= first)
        .group_by("month")
    ).all()
    collected = {m: Decimal(v) for m, v in coll_rows}
    raised = {m: Decimal(v) for m, v in due_rows}
    money = [
        {"month": m, "collected": collected.get(m, ZERO), "raised": raised.get(m, ZERO)}
        for m in window
    ]

    outstanding = db.execute(
        select(func.coalesce(func.sum(StudentFee.amount_due - StudentFee.amount_paid), 0)).where(
            StudentFee.school_id == school_id,
            StudentFee.status.notin_([FeeStatus.paid, FeeStatus.waived]),
        )
    ).scalar_one()

    this_month = window[-1]
    return {
        **academic_average(db, school_id),
        "students": students,
        "staff": staff,
        "attendance_this_month": att[this_month]["percent"],
        "collected_this_month": collected.get(this_month, ZERO),
        "outstanding": Decimal(outstanding),
        "attendance_by_month": [att[m] for m in window],
        "money_by_month": money,
    }


def academic_average(db: Session, school_id: int) -> dict:
    """The school's average score: every mark scored in the published exams
    of the current academic year, each paper as a percentage of its maximum.
    None when nothing is published yet — a zero would read as a result."""
    year_ids = select(AcademicYear.id).where(
        AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True)
    )
    row = db.execute(
        select(
            func.avg(cast(Mark.marks_obtained, Numeric) * 100 / ExamSubject.max_marks),
            func.count(Mark.id),
            func.count(func.distinct(Exam.id)),
        )
        .join(ExamSubject, ExamSubject.id == Mark.exam_subject_id)
        .join(Exam, Exam.id == ExamSubject.exam_id)
        .where(
            Exam.school_id == school_id,
            Exam.is_published.is_(True),
            Exam.academic_year_id.in_(year_ids),
            Mark.status == MarkStatus.scored,
            Mark.marks_obtained.is_not(None),
            ExamSubject.max_marks > 0,
        )
    ).one()
    avg, marks, exams = row
    return {
        "academic_average": round(float(avg), 1) if avg is not None else None,
        "academic_average_marks": marks,
        "academic_average_exams": exams,
    }


# ---------- who is in the school ----------


def strength(db: Session, school_id: int, academic_year_id: Optional[int] = None) -> dict:
    """Roll numbers by class and section, which is what a strength report is."""
    year_id = academic_year_id or db.execute(
        select(AcademicYear.id).where(AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True))
    ).scalar_one_or_none()

    rows = db.execute(
        select(
            SchoolClass.id, SchoolClass.name, Section.id, Section.name,
            func.count(Student.id).filter(Student.is_active.is_(True)),
            func.count(Student.id).filter(Student.is_active.is_(True), Student.gender == "male"),
            func.count(Student.id).filter(Student.is_active.is_(True), Student.gender == "female"),
            Section.capacity,
        )
        .select_from(SchoolClass)
        .join(Section, Section.class_id == SchoolClass.id, isouter=True)
        .join(Student, Student.section_id == Section.id, isouter=True)
        .where(SchoolClass.school_id == school_id, SchoolClass.academic_year_id == year_id)
        .group_by(SchoolClass.id, SchoolClass.name, Section.id, Section.name, Section.capacity)
        .order_by(SchoolClass.display_order, SchoolClass.name, Section.name)
    ).all()

    sections = [
        {
            "class_id": cid, "class_name": cname, "section_id": sid, "section_name": sname,
            "students": n, "boys": boys, "girls": girls, "capacity": cap or 0,
            "fill_percent": _pct(n, cap) if cap else 0.0,
        }
        for cid, cname, sid, sname, n, boys, girls, cap in rows if sid
    ]
    classes: dict[int, dict] = {}
    for s in sections:
        c = classes.setdefault(s["class_id"], {"class_id": s["class_id"], "class_name": s["class_name"],
                                               "students": 0, "boys": 0, "girls": 0, "capacity": 0, "sections": 0})
        c["students"] += s["students"]
        c["boys"] += s["boys"]
        c["girls"] += s["girls"]
        c["capacity"] += s["capacity"]
        c["sections"] += 1

    # the same count a year ago, so the trend is visible rather than implied
    prior = db.execute(
        select(AcademicYear.id, AcademicYear.name)
        .where(AcademicYear.school_id == school_id, AcademicYear.id != year_id)
        .order_by(AcademicYear.start_date.desc())
    ).all()
    history = []
    for yid, yname in prior[:4]:
        n = db.execute(
            select(func.count(Student.id)).where(Student.school_id == school_id, Student.academic_year_id == yid)
        ).scalar_one()
        history.append({"academic_year_id": yid, "academic_year_name": yname, "students": n})

    total = sum(s["students"] for s in sections)
    capacity = sum(s["capacity"] for s in sections)
    return {
        "academic_year_id": year_id,
        "total_students": total,
        "total_capacity": capacity,
        "fill_percent": _pct(total, capacity) if capacity else 0.0,
        "classes": sorted(classes.values(), key=lambda c: c["class_name"]),
        "sections": sections,
        "history": history,
    }


def demographics(db: Session, school_id: int) -> dict:
    """Gender, age and blood group across the school — the figures every
    board return asks for, and nobody wants to count by hand."""
    students = list(db.execute(
        select(Student).where(Student.school_id == school_id, Student.is_active.is_(True))
    ).scalars())

    def bucket(rows, key):
        counts: dict[str, int] = {}
        for r in rows:
            v = key(r)
            counts[v] = counts.get(v, 0) + 1
        return [{"label": k, "count": v} for k, v in sorted(counts.items(), key=lambda kv: -kv[1])]

    today = date.today()

    def age_of(s: Student) -> str:
        if not s.dob:
            return "Not recorded"
        years = today.year - s.dob.year - ((today.month, today.day) < (s.dob.month, s.dob.day))
        return f"{years}"

    return {
        "total": len(students),
        "gender": bucket(students, lambda s: s.gender.value if s.gender else "Not recorded"),
        "blood_group": bucket(students, lambda s: s.blood_group or "Not recorded"),
        "age": sorted(bucket(students, age_of), key=lambda b: (b["label"] == "Not recorded", b["label"])),
        "recorded": {
            "dob": sum(1 for s in students if s.dob),
            "gender": sum(1 for s in students if s.gender),
            "blood_group": sum(1 for s in students if s.blood_group),
        },
    }


def chronic_absence(db: Session, school_id: int, *, below: float = 75.0,
                    frm: Optional[date] = None, to: Optional[date] = None,
                    min_days: int = 10) -> dict:
    """Children whose attendance has slipped, school-wide.

    The monthly report shows one section at a time, which is no use for
    spotting the child nobody has noticed. Anyone below the threshold appears
    here, with enough marked days that the figure means something.
    """
    frm = frm or date.today() - timedelta(days=120)
    to = to or date.today()
    present = func.count(StudentAttendance.id).filter(
        StudentAttendance.status.in_([AttendanceStatus.present, AttendanceStatus.late])
    )
    half = func.count(StudentAttendance.id).filter(StudentAttendance.status == AttendanceStatus.half_day)
    marked = func.count(StudentAttendance.id)

    rows = db.execute(
        select(Student, SchoolClass.name, Section.name, marked, present, half)
        .join(StudentAttendance, StudentAttendance.student_id == Student.id)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(
            Student.school_id == school_id, Student.is_active.is_(True),
            StudentAttendance.date >= frm, StudentAttendance.date <= to,
        )
        .group_by(Student.id, SchoolClass.name, Section.name)
        .having(marked >= min_days)
    ).all()

    out = []
    for student, cname, sname, n_marked, n_present, n_half in rows:
        pct = _pct(n_present + 0.5 * n_half, n_marked)
        if pct < below:
            out.append({
                "student_id": student.id, "admission_no": student.admission_no,
                "student_name": student.full_name,
                "section_label": f"{cname} {sname}" if cname and sname else None,
                "marked_days": n_marked, "present_days": n_present,
                "absent_days": n_marked - n_present - n_half, "percent": pct,
            })
    out.sort(key=lambda r: r["percent"])

    # When somebody last rang home about each child (recorded on SCR-118).
    from app.models.attendance_ops import AbsenceContact

    last: dict[int, AbsenceContact] = {}
    ids = [r["student_id"] for r in out]
    if ids:
        for c in db.execute(
            select(AbsenceContact)
            .where(AbsenceContact.school_id == school_id, AbsenceContact.student_id.in_(ids))
            .order_by(AbsenceContact.contacted_on.desc(), AbsenceContact.id.desc())
        ).scalars():
            last.setdefault(c.student_id, c)
    today = date.today()
    for r in out:
        c = last.get(r["student_id"])
        r["last_follow_up_on"] = c.contacted_on if c else None
        r["last_follow_up_method"] = c.method.value if c else None
        r["next_follow_up_on"] = c.follow_up_on if c else None
        r["follow_up_due"] = bool(c and c.follow_up_on and c.follow_up_on <= today)
    return {
        "from_date": frm, "to_date": to, "below": below, "min_days": min_days,
        "students": out, "count": len(out),
    }


# ---------- how the teaching is going ----------


def exam_analysis(db: Session, school_id: int, exam_id: int) -> dict:
    """Pass rate, grade spread and the subjects that went wrong."""
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != school_id:
        raise _404("Exam")

    rows = db.execute(
        select(Mark, ExamSubject, Subject, Student, SchoolClass.name, Section.name)
        .join(ExamSubject, ExamSubject.id == Mark.exam_subject_id)
        .join(ClassSubject, ClassSubject.id == ExamSubject.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .join(Student, Student.id == Mark.student_id)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(ExamSubject.exam_id == exam_id)
    ).all()

    grades: dict[str, int] = {}
    per_subject: dict[int, dict] = {}
    per_student: dict[int, dict] = {}
    failed_any: set[int] = set()
    scored = 0
    passed = 0
    for mark, paper, subject, student, cname, sname in rows:
        if mark.grade:
            grades[mark.grade] = grades.get(mark.grade, 0) + 1
        s = per_subject.setdefault(subject.id, {
            "subject_id": subject.id, "subject_name": subject.name, "subject_code": subject.code,
            "max_marks": paper.max_marks, "entered": 0, "passed": 0, "total": 0,
            "highest": 0, "lowest": None, "absent": 0,
        })
        s["entered"] += 1
        if mark.status == MarkStatus.absent:
            s["absent"] += 1
        if mark.marks_obtained is not None and mark.status == MarkStatus.scored:
            scored += 1
            s["total"] += mark.marks_obtained
            s["highest"] = max(s["highest"], mark.marks_obtained)
            s["lowest"] = mark.marks_obtained if s["lowest"] is None else min(s["lowest"], mark.marks_obtained)
            if mark.is_pass:
                passed += 1
                s["passed"] += 1
            st = per_student.setdefault(student.id, {
                "student_id": student.id, "student_name": student.full_name,
                "admission_no": student.admission_no,
                "section_label": f"{cname} {sname}" if cname and sname else None,
                "obtained": 0, "max": 0,
            })
            st["obtained"] += mark.marks_obtained
            st["max"] += paper.max_marks
            if mark.is_pass is False:
                failed_any.add(student.id)

    subjects = []
    for s in per_subject.values():
        marked = s["entered"] - s["absent"]
        s["average"] = round(s["total"] / marked, 1) if marked else 0.0
        s["average_percent"] = _pct(s["total"], marked * s["max_marks"]) if marked else 0.0
        s["pass_percent"] = _pct(s["passed"], marked)
        s.pop("total")
        subjects.append(s)
    subjects.sort(key=lambda s: s["average_percent"])

    toppers = sorted(per_student.values(), key=lambda s: -(s["obtained"] / s["max"] if s["max"] else 0))
    for t in toppers:
        t["percent"] = _pct(t["obtained"], t["max"])

    # Class by class: a student passes when every paper they sat was a pass,
    # and "needs support" is anyone who failed a paper or scored under 40%.
    per_class: dict[str, dict] = {}
    for sid, t in per_student.items():
        label = t["section_label"] or "No section"
        c = per_class.setdefault(label, {"section_label": label, "appeared": 0, "passed": 0, "failed": 0,
                                         "pct_sum": 0.0, "top_percent": 0.0, "needs_support": 0})
        c["appeared"] += 1
        failed = sid in failed_any
        c["failed" if failed else "passed"] += 1
        c["pct_sum"] += t["percent"]
        c["top_percent"] = max(c["top_percent"], t["percent"])
        if failed or t["percent"] < 40:
            c["needs_support"] += 1
    classes = []
    for c in per_class.values():
        c["average_percent"] = round(c.pop("pct_sum") / c["appeared"], 1) if c["appeared"] else 0.0
        c["pass_percent"] = _pct(c["passed"], c["appeared"])
        classes.append(c)
    classes.sort(key=lambda c: c["section_label"])

    return {
        "exam_id": exam.id, "exam_name": exam.name, "is_published": exam.is_published,
        "marks_entered": scored, "pass_percent": _pct(passed, scored),
        "grades": [{"grade": g, "count": n} for g, n in sorted(grades.items())],
        "subjects": subjects,
        "toppers": toppers[:10],
        "struggling": [s for s in subjects if s["pass_percent"] < 60][:5],
        "classes": classes,
    }


def teacher_activity(db: Session, school_id: int, *, days: int = 90) -> dict:
    """What each teacher has done lately — classes held, syllabus covered,
    marks entered, homework set.

    Deliberately not a score. These are counts of work done, which a head can
    read alongside what they know about a person; a single ranked number would
    be used as an appraisal it cannot support.
    """
    from app.services.staff_ops_service import observation_average

    since = date.today() - timedelta(days=days)
    teachers = list(db.execute(
        select(User).where(
            User.school_id == school_id, User.is_active.is_(True),
            User.role.in_([UserRole.teacher, UserRole.principal]),
        ).order_by(User.full_name)
    ).scalars())

    out = []
    for t in teachers:
        subjects = list(db.execute(
            select(ClassSubject.id).where(ClassSubject.teacher_user_id == t.id)
        ).scalars())
        sections = db.execute(
            select(func.count(Section.id)).where(Section.class_teacher_user_id == t.id)
        ).scalar_one()
        marks = db.execute(
            select(func.count(Mark.id)).where(Mark.marked_by_user_id == t.id, Mark.marked_at.is_not(None))
        ).scalar_one()
        homework = db.execute(
            select(func.count(Homework.id)).where(
                Homework.created_by_user_id == t.id, Homework.created_at >= since
            )
        ).scalar_one()
        topics_total = db.execute(
            select(func.count(SyllabusTopic.id))
            .join(SyllabusChapter, SyllabusChapter.id == SyllabusTopic.chapter_id)
            .where(SyllabusChapter.class_subject_id.in_(subjects))
        ).scalar_one() if subjects else 0
        topics_done = db.execute(
            select(func.count(func.distinct(TopicCoverage.topic_id)))
            .join(SyllabusTopic, SyllabusTopic.id == TopicCoverage.topic_id)
            .join(SyllabusChapter, SyllabusChapter.id == SyllabusTopic.chapter_id)
            .where(SyllabusChapter.class_subject_id.in_(subjects))
        ).scalar_one() if subjects else 0
        attendance_marked = db.execute(
            select(func.count(func.distinct(StudentAttendance.date))).where(
                StudentAttendance.marked_by_user_id == t.id, StudentAttendance.date >= since
            )
        ).scalar_one()

        staff = db.execute(select(Staff).where(Staff.user_id == t.id)).scalar_one_or_none()
        obs = list(db.execute(
            select(ClassroomObservation).where(
                ClassroomObservation.staff_id == staff.id,
                ClassroomObservation.observed_on >= since,
            ).order_by(ClassroomObservation.observed_on.desc())
        ).scalars()) if staff else []
        averages = [a for a in (observation_average(o) for o in obs) if a is not None]
        latest = obs[0] if obs else None
        if latest is None:
            review_status = "not_observed"
        elif latest.follow_up_on and latest.follow_up_on <= date.today():
            review_status = "follow_up_due"
        elif not latest.shared_with_staff:
            review_status = "feedback_pending"
        else:
            review_status = "reviewed"

        out.append({
            "user_id": t.id, "name": t.full_name, "role": t.role.value,
            "staff_id": staff.id if staff else None,
            "department_name": staff.department.name if staff and staff.department_id and staff.department else None,
            "observations": len(obs),
            # The mean of the 1-5 ratings given in the period, shown next to
            # the counts; it is not used to order anybody.
            "observation_score": round(sum(averages) / len(averages), 1) if averages else None,
            "last_observed_on": latest.observed_on if latest else None,
            "review_status": review_status,
            "subjects": len(subjects), "class_teacher_of": sections,
            "syllabus_topics": topics_total, "syllabus_covered": topics_done,
            "syllabus_percent": _pct(topics_done, topics_total),
            "marks_entered": marks, "homework_set": homework,
            "days_attendance_marked": attendance_marked,
        })
    return {"days": days, "since": since, "teachers": out}


# ---------- money ----------


def fee_collection(db: Session, school_id: int, *, frm: Optional[date] = None,
                   to: Optional[date] = None) -> dict:
    """What came in, split the two ways an accountant is asked for it:
    by fee head, and by class."""
    to = to or date.today()
    frm = frm or (to.replace(day=1) - timedelta(days=150))

    rows = db.execute(
        select(FeeCollection, StudentFee, FeeHead, Student, SchoolClass.name)
        .join(StudentFee, StudentFee.id == FeeCollection.student_fee_id)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id, isouter=True)
        .join(Student, Student.id == FeeCollection.student_id)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(
            FeeCollection.school_id == school_id,
            FeeCollection.collected_on >= frm,
            FeeCollection.collected_on <= to,
        )
    ).all()

    by_head: dict[str, Decimal] = {}
    by_class: dict[str, Decimal] = {}
    by_mode: dict[str, Decimal] = {}
    by_month: dict[str, Decimal] = {}
    total = ZERO
    for c, sf, head, student, class_name in rows:
        amount = Decimal(c.amount)
        total += amount
        head_name = head.name if head else "Other"
        by_head[head_name] = by_head.get(head_name, ZERO) + amount
        cls_name = class_name or "No class"
        by_class[cls_name] = by_class.get(cls_name, ZERO) + amount
        by_mode[c.mode.value] = by_mode.get(c.mode.value, ZERO) + amount
        key = f"{c.collected_on:%Y-%m}"
        by_month[key] = by_month.get(key, ZERO) + amount

    def rows_of(d: dict) -> list[dict]:
        return [{"label": k, "amount": v} for k, v in sorted(d.items(), key=lambda kv: -kv[1])]

    receipts_by_head: dict[str, int] = {}
    for c, sf, head, student, class_name in rows:
        name = head.name if head else "Other"
        receipts_by_head[name] = receipts_by_head.get(name, 0) + 1

    return {
        "from_date": frm, "to_date": to, "receipts": len(rows), "total": total,
        "by_head": rows_of(by_head), "by_class": rows_of(by_class), "by_mode": rows_of(by_mode),
        "by_month": [{"month": m, "amount": a} for m, a in sorted(by_month.items())],
        "billed_by_head": billed_by_head(db, school_id, frm=frm, to=to, receipts=receipts_by_head),
    }


def billed_by_head(db: Session, school_id: int, *, frm: date, to: date,
                   receipts: Optional[dict[str, int]] = None) -> list[dict]:
    """What was billed per fee head against what has come in for it.

    The bills counted are the ones falling due in the window; waived bills
    are left out, since nobody expects that money. "Paid" is what has been
    paid against those same bills, whenever it arrived, so the collection
    rate compares like with like.
    """
    rows = db.execute(
        select(
            func.coalesce(FeeHead.name, "Other"),
            func.coalesce(func.sum(StudentFee.amount_due), 0),
            func.coalesce(func.sum(StudentFee.amount_paid), 0),
            func.count(StudentFee.id),
        )
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id, isouter=True)
        .where(
            StudentFee.school_id == school_id,
            StudentFee.due_date >= frm,
            StudentFee.due_date <= to,
            StudentFee.status != FeeStatus.waived,
        )
        .group_by(FeeHead.name)
    ).all()
    out = []
    for name, due, paid, bills in rows:
        due, paid = Decimal(due), Decimal(paid)
        out.append({
            "label": name,
            "expected": due,
            "paid": paid,
            "outstanding": max(due - paid, ZERO),
            "collection_rate": _pct(float(paid), float(due)) if due else 0.0,
            "bills": bills,
            "receipts": (receipts or {}).get(name, 0),
        })
    out.sort(key=lambda r: -r["expected"])
    return out


def dues_ageing(db: Session, school_id: int) -> dict:
    """How old the unpaid money is, and who owes the most of it.

    A single outstanding total hides the difference between a bill raised last
    week and one ignored since June, so it is bucketed by how long it has been
    overdue.
    """
    today = date.today()
    rows = db.execute(
        select(StudentFee, Student, SchoolClass.name, Section.name, FeeHead.name)
        .join(Student, Student.id == StudentFee.student_id)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id, isouter=True)
        .where(
            StudentFee.school_id == school_id,
            StudentFee.status.notin_([FeeStatus.paid, FeeStatus.waived]),
        )
    ).all()

    buckets = {
        "Not yet due": ZERO, "1-30 days": ZERO, "31-60 days": ZERO,
        "61-90 days": ZERO, "Over 90 days": ZERO,
    }
    per_student: dict[int, dict] = {}
    total = ZERO
    for fee, student, class_name, section_name, head in rows:
        owed = Decimal(fee.amount_due) - Decimal(fee.amount_paid or 0)
        if owed <= 0:
            continue
        total += owed
        overdue_days = (today - fee.due_date).days if fee.due_date else 0
        if overdue_days <= 0:
            key = "Not yet due"
        elif overdue_days <= 30:
            key = "1-30 days"
        elif overdue_days <= 60:
            key = "31-60 days"
        elif overdue_days <= 90:
            key = "61-90 days"
        else:
            key = "Over 90 days"
        buckets[key] += owed

        s = per_student.setdefault(student.id, {
            "student_id": student.id, "student_name": student.full_name,
            "admission_no": student.admission_no,
            "section_label": f"{class_name} {section_name}" if class_name and section_name else None,
            "owed": ZERO, "items": 0, "oldest_days": 0,
        })
        s["owed"] += owed
        s["items"] += 1
        s["oldest_days"] = max(s["oldest_days"], max(overdue_days, 0))

    defaulters = sorted(per_student.values(), key=lambda s: -s["owed"])
    return {
        "as_of": today,
        "total": total,
        "students_owing": len(defaulters),
        "buckets": [{"label": k, "amount": v} for k, v in buckets.items()],
        "defaulters": defaulters[:50],
    }


# ---------- the operational modules ----------


def staff_attendance_summary(db: Session, school_id: int, year: int, month: int) -> dict:
    """A month of staff attendance per person, rather than a day at a time."""
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    rows = db.execute(
        select(StaffAttendance, User)
        .join(User, User.id == StaffAttendance.user_id)
        .where(
            StaffAttendance.school_id == school_id,
            StaffAttendance.date >= first, StaffAttendance.date <= last,
        )
    ).all()

    per_user: dict[int, dict] = {}
    for row, user in rows:
        u = per_user.setdefault(user.id, {
            "user_id": user.id, "name": user.full_name, "role": user.role.value,
            "present": 0, "late": 0, "absent": 0, "on_leave": 0, "sick": 0,
            "holiday": 0, "marked": 0,
        })
        key = row.status.value
        if key in u:
            u[key] += 1
        # a holiday is not a day somebody failed to turn up on
        if row.status is not StaffAttendanceStatus.holiday:
            u["marked"] += 1
    for u in per_user.values():
        u["percent"] = _pct(u["present"] + u["late"], u["marked"])

    return {
        "year": year, "month": month, "from_date": first, "to_date": last,
        "working_days": len({r.date for r, _ in rows if r.status is not StaffAttendanceStatus.holiday}),
        "staff": sorted(per_user.values(), key=lambda u: u["percent"]),
    }


def transport_utilisation(db: Session, school_id: int) -> dict:
    """Seats bought against seats used, route by route."""
    rows = db.execute(
        select(TransportRoute, Vehicle.capacity, Vehicle.registration_no,
               func.count(TransportAssignment.id).filter(TransportAssignment.end_date.is_(None)))
        .join(Vehicle, Vehicle.id == TransportRoute.vehicle_id, isouter=True)
        .join(TransportAssignment, TransportAssignment.route_id == TransportRoute.id, isouter=True)
        .where(TransportRoute.school_id == school_id, TransportRoute.is_active.is_(True))
        .group_by(TransportRoute.id, Vehicle.capacity, Vehicle.registration_no)
        .order_by(TransportRoute.name)
    ).all()

    today = date.today()
    route_ids = [r[0].id for r in rows] or [-1]
    # Today's morning run, per route: how many were marked on the bus.
    trips_today = {
        t.route_id: t for t in db.execute(
            select(Trip).where(Trip.route_id.in_(route_ids), Trip.trip_date == today,
                               Trip.direction == TripDirection.pickup)
        ).scalars()
    }
    boarded = dict(db.execute(
        select(Trip.route_id, func.count(TripBoarding.id))
        .join(TripBoarding, TripBoarding.trip_id == Trip.id)
        .where(Trip.route_id.in_(route_ids), Trip.trip_date == today, Trip.direction == TripDirection.pickup,
               TripBoarding.status == BoardingStatus.boarded)
        .group_by(Trip.route_id)
    ).all())

    routes = []
    for route, capacity, reg, riders in rows:
        cap = capacity or 0
        trip = trips_today.get(route.id)
        routes.append({
            "route_id": route.id, "route_name": route.name, "vehicle": reg,
            "capacity": cap, "riders": riders,
            "free_seats": max(cap - riders, 0),
            "utilisation": _pct(riders, cap) if cap else 0.0,
            "over_capacity": cap > 0 and riders > cap,
            "boarded_today": boarded.get(route.id, 0) if trip else None,
            "trip_status_today": trip.status.value if trip else None,
            "distance_km": _route_distance(db, route.id),
        })
    total_cap = sum(r["capacity"] for r in routes)
    total_riders = sum(r["riders"] for r in routes)
    return {
        "routes": routes,
        "total_capacity": total_cap,
        "total_riders": total_riders,
        "utilisation": _pct(total_riders, total_cap) if total_cap else 0.0,
        "over_capacity": [r for r in routes if r["over_capacity"]],
    }


def _route_distance(db: Session, route_id: int) -> Optional[float]:
    """How long the route is, in km.

    From the odometer when trips have been logged with readings (the average
    of the last ten), otherwise from the stops' map points, stop to stop in a
    straight line — an underestimate, but an honest one. None when neither
    is recorded."""
    from math import asin, cos, radians, sin, sqrt

    runs = [
        e - s for s, e in db.execute(
            select(Trip.start_odometer_km, Trip.end_odometer_km)
            .where(Trip.route_id == route_id, Trip.start_odometer_km.is_not(None),
                   Trip.end_odometer_km.is_not(None))
            .order_by(Trip.trip_date.desc()).limit(10)
        ).all() if e is not None and s is not None and e >= s
    ]
    if runs:
        return round(sum(runs) / len(runs), 1)
    pts = [(a, b) for a, b in db.execute(
        select(TransportStop.lat, TransportStop.lng)
        .where(TransportStop.route_id == route_id).order_by(TransportStop.sequence)
    ).all()]
    if len(pts) < 2 or any(a is None or b is None for a, b in pts):
        return None
    km = 0.0
    for (a1, b1), (a2, b2) in zip(pts, pts[1:]):
        p1, p2 = radians(a1), radians(a2)
        d = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(b2 - b1) / 2) ** 2
        km += 2 * 6371 * asin(sqrt(d))
    return round(km, 1)


def payroll_by_department(db: Session, school_id: int, run_id: Optional[int] = None) -> dict:
    """One payroll run, totalled by the department each person belongs to.
    The latest run when none is named."""
    from app.models.foundation import Department
    from app.models.payroll import PayrollRun, Payslip
    from app.models.staff import Staff

    stmt = select(PayrollRun).where(PayrollRun.school_id == school_id)
    run = (db.execute(stmt.where(PayrollRun.id == run_id)).scalar_one_or_none() if run_id
           else db.execute(stmt.order_by(PayrollRun.period.desc()).limit(1)).scalar_one_or_none())
    if run_id and not run:
        raise _404("Payroll run")
    if not run:
        return {"run_id": None, "period": None, "status": None, "departments": []}
    rows = db.execute(
        select(Payslip, Department.name)
        .join(Staff, Staff.id == Payslip.staff_id, isouter=True)
        .join(Department, Department.id == Staff.department_id, isouter=True)
        .where(Payslip.run_id == run.id)
    ).all()
    depts: dict[str, dict] = {}
    for slip, dept in rows:
        name = dept or "No department"
        d = depts.setdefault(name, {"department": name, "staff": 0, "gross": ZERO, "deductions": ZERO,
                                    "net": ZERO, "employer_cost": ZERO})
        d["staff"] += 1
        d["gross"] += Decimal(slip.gross or 0)
        d["deductions"] += Decimal(slip.total_deductions or 0)
        d["net"] += Decimal(slip.net_pay or 0)
        d["employer_cost"] += (Decimal(slip.gross or 0) + Decimal(slip.pf_employer or 0)
                               + Decimal(slip.esi_employer or 0))
    return {
        "run_id": run.id, "period": run.period, "status": run.status.value,
        "departments": sorted(depts.values(), key=lambda d: -d["net"]),
    }


def library_usage(db: Session, school_id: int, *, frm: Optional[date] = None,
                  to: Optional[date] = None) -> dict:
    """Issues over time, what gets borrowed, and how much of the shelf moves."""
    to = to or date.today()
    frm = frm or (to - timedelta(days=180))
    loans = list(db.execute(
        select(Loan).where(Loan.school_id == school_id, Loan.issued_on >= frm, Loan.issued_on <= to)
    ).scalars())

    by_month: dict[str, dict] = {}
    for l in loans:
        key = f"{l.issued_on:%Y-%m}"
        by_month.setdefault(key, {"month": key, "issued": 0, "returned": 0})["issued"] += 1
        if l.returned_on and frm <= l.returned_on <= to:
            back = f"{l.returned_on:%Y-%m}"
            by_month.setdefault(back, {"month": back, "issued": 0, "returned": 0})["returned"] += 1

    titles: dict[int, dict] = {}
    for l in loans:
        copy = db.get(BookCopy, l.copy_id)
        book = db.get(Book, copy.book_id) if copy else None
        if not book:
            continue
        titles.setdefault(book.id, {"book_id": book.id, "title": book.title, "times": 0})["times"] += 1

    total_copies = db.execute(
        select(func.count(BookCopy.id)).where(BookCopy.school_id == school_id)
    ).scalar_one()
    out_now = db.execute(
        select(func.count(Loan.id)).where(
            Loan.school_id == school_id, Loan.returned_on.is_(None), Loan.lost_on.is_(None)
        )
    ).scalar_one()

    # By category. Members are the distinct borrowers in the window; overdue
    # is what is out past its due date right now.
    today = date.today()
    overdue_now = list(db.execute(
        select(Loan).where(
            Loan.school_id == school_id, Loan.returned_on.is_(None), Loan.lost_on.is_(None),
            Loan.due_on < today,
        )
    ).scalars())
    book_of: dict[int, Optional[Book]] = {}

    def book_for(loan: Loan) -> Optional[Book]:
        if loan.copy_id not in book_of:
            copy = db.get(BookCopy, loan.copy_id)
            book_of[loan.copy_id] = db.get(Book, copy.book_id) if copy else None
        return book_of[loan.copy_id]

    def who(loan: Loan) -> tuple:
        return (loan.borrower_type.value, loan.student_id or loan.user_id)

    cats: dict[str, dict] = {}

    def cat(book: Optional[Book]) -> dict:
        name = (book.category or "").strip() if book else ""
        name = name or "Uncategorised"
        return cats.setdefault(name, {"category": name, "members": set(), "issues": 0, "returns": 0,
                                      "overdue": 0, "titles": {}})

    for l in loans:
        book = book_for(l)
        c = cat(book)
        c["issues"] += 1
        c["members"].add(who(l))
        if l.returned_on:
            c["returns"] += 1
        if book:
            c["titles"][book.title] = c["titles"].get(book.title, 0) + 1
    for l in overdue_now:
        cat(book_for(l))["overdue"] += 1
    by_category = []
    for c in cats.values():
        top = max(c["titles"].items(), key=lambda kv: kv[1])[0] if c["titles"] else None
        by_category.append({"category": c["category"], "members": len(c["members"]), "issues": c["issues"],
                            "returns": c["returns"], "overdue": c["overdue"], "most_borrowed": top})
    by_category.sort(key=lambda c: (-c["issues"], c["category"]))

    return {
        "from_date": frm, "to_date": to,
        "issued": len(loans),
        "returned": sum(1 for l in loans if l.returned_on),
        "copies": total_copies,
        "out_now": out_now,
        "shelf_in_use": _pct(out_now, total_copies) if total_copies else 0.0,
        "by_month": [by_month[k] for k in sorted(by_month)],
        "top_titles": sorted(titles.values(), key=lambda t: -t["times"])[:10],
        "members": len({who(l) for l in loans}),
        "overdue_now": len(overdue_now),
        "by_category": by_category,
    }


def inventory_valuation(db: Session, school_id: int) -> dict:
    """What the store and the asset register are worth, and what is running out."""
    items = list(db.execute(
        select(InventoryItem).where(InventoryItem.school_id == school_id, InventoryItem.is_active.is_(True))
    ).scalars())

    by_category: dict[str, dict] = {}
    low: list[dict] = []
    stock_value = ZERO
    for item in items:
        moves = db.execute(
            select(StockMove.kind, func.coalesce(func.sum(StockMove.qty), 0),
                   func.avg(cast(StockMove.unit_cost, Numeric(12, 2))))
            .where(StockMove.item_id == item.id)
            .group_by(StockMove.kind)
        ).all()
        on_hand = ZERO
        cost = ZERO
        for kind, qty, avg_cost in moves:
            qty = Decimal(qty)
            if kind in (StockMoveKind.purchase, StockMoveKind.return_in, StockMoveKind.adjustment_in):
                on_hand += qty
                if avg_cost:
                    cost = Decimal(avg_cost)
            else:
                on_hand -= qty
        value = on_hand * cost
        stock_value += value
        cat = item.category or "Uncategorised"
        c = by_category.setdefault(cat, {"label": cat, "items": 0, "value": ZERO})
        c["items"] += 1
        c["value"] += value
        if item.reorder_level and on_hand <= Decimal(item.reorder_level):
            low.append({"item_id": item.id, "name": item.name, "sku": item.sku,
                        "on_hand": on_hand, "reorder_level": Decimal(item.reorder_level)})

    assets = list(db.execute(select(Asset).where(Asset.school_id == school_id)).scalars())
    asset_value = sum((Decimal(a.cost) for a in assets if a.cost), ZERO)
    by_status: dict[str, dict] = {}
    for a in assets:
        s = by_status.setdefault(a.status.value, {"label": a.status.value, "count": 0, "value": ZERO})
        s["count"] += 1
        if a.cost:
            s["value"] += Decimal(a.cost)

    return {
        "stock_value": stock_value,
        "asset_value": asset_value,
        "items": len(items),
        "assets": len(assets),
        "by_category": sorted(by_category.values(), key=lambda c: -c["value"]),
        "assets_by_status": sorted(by_status.values(), key=lambda s: -s["count"]),
        "low_stock": sorted(low, key=lambda l: l["on_hand"])[:25],
    }


def notification_report(db: Session, school_id: int, *, frm: Optional[date] = None,
                        to: Optional[date] = None) -> dict:
    """What the school sent, to whom, and how much of it actually left the app."""
    to = to or date.today()
    frm = frm or (to - timedelta(days=90))
    notices = list(db.execute(
        select(Notice).where(
            Notice.school_id == school_id,
            func.date(Notice.created_at) >= frm,
            func.date(Notice.created_at) <= to,
        ).order_by(Notice.created_at.desc())
    ).scalars())

    by_audience: dict[str, int] = {}
    by_month: dict[str, int] = {}
    for n in notices:
        by_audience[n.audience.value] = by_audience.get(n.audience.value, 0) + 1
        key = f"{n.created_at:%Y-%m}"
        by_month[key] = by_month.get(key, 0) + 1

    channel_rows = db.execute(
        select(NoticeRecipient.channel, NoticeRecipient.status, func.count(NoticeRecipient.id),
               func.count(NoticeRecipient.read_at))
        .join(Notice, Notice.id == NoticeRecipient.notice_id)
        .where(
            Notice.school_id == school_id,
            func.date(Notice.created_at) >= frm,
            func.date(Notice.created_at) <= to,
        )
        .group_by(NoticeRecipient.channel, NoticeRecipient.status)
    ).all()
    channels: dict[str, dict] = {}
    for channel, st, n, read in channel_rows:
        c = channels.setdefault(channel.value, {"channel": channel.value, "total": 0, "read": 0})
        c["total"] += n
        c["read"] += read
        c[st.value] = c.get(st.value, 0) + n

    return {
        "from_date": frm, "to_date": to,
        "notices": len(notices),
        "recipients": sum(c["total"] for c in channels.values()),
        "by_audience": [{"label": k, "count": v} for k, v in sorted(by_audience.items(), key=lambda kv: -kv[1])],
        "by_month": [{"month": m, "count": n} for m, n in sorted(by_month.items())],
        "channels": sorted(channels.values(), key=lambda c: -c["total"]),
    }
