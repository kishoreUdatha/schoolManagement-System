"""Reports a school defines for itself.

The fixed exports cover the common cases; this lets a school save its own —
pick a source, the filters that matter to it and the columns it wants — and run
it whenever, on screen or as a CSV. Each CSV run is kept as an export job so
the same file can be fetched again without re-running the query.
"""
import csv
import io
from datetime import date, datetime, timezone
from typing import Any, Callable, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.enums import AttendanceStatus, ExportStatus, FeeStatus, ReportSource
from app.models.academic import SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.datadesk import ExportJob, ReportDefinition
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, StudentFee
from app.models.mark import Mark
from app.models.staff import Staff
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User
from app.schemas.report import ReportIn, ReportUpdate


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


# ---------- the sources a report can be built on ----------


def _students(db: Session, school_id: int, f: dict) -> list[dict]:
    stmt = (
        select(Student, Section, SchoolClass)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(Student.school_id == school_id)
        .order_by(SchoolClass.name, Section.name, Student.roll_no)
    )
    if f.get("academic_year_id"):
        stmt = stmt.where(Student.academic_year_id == f["academic_year_id"])
    if f.get("section_id"):
        stmt = stmt.where(Student.section_id == f["section_id"])
    elif f.get("class_id"):
        stmt = stmt.where(Section.class_id == f["class_id"])
    if f.get("status") == "active":
        stmt = stmt.where(Student.is_active.is_(True))
    elif f.get("status") == "inactive":
        stmt = stmt.where(Student.is_active.is_(False))
    if f.get("gender"):
        stmt = stmt.where(Student.gender == f["gender"])
    return [{
        "admission_no": s.admission_no,
        "full_name": s.full_name,
        "class_name": cls.name if cls else None,
        "section_name": sec.name if sec else None,
        "roll_no": s.roll_no,
        "gender": s.gender.value if s.gender else None,
        "dob": s.dob,
        "blood_group": s.blood_group,
        "is_active": s.is_active,
    } for (s, sec, cls) in db.execute(stmt)]


def _staff(db: Session, school_id: int, f: dict) -> list[dict]:
    stmt = (
        select(Staff, User).join(User, User.id == Staff.user_id)
        .where(Staff.school_id == school_id).order_by(User.full_name)
    )
    if f.get("role"):
        stmt = stmt.where(User.role == f["role"])
    if f.get("status") == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif f.get("status") == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    return [{
        "employee_no": st.employee_no,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role.value,
        "designation": st.designation,
        "joining_date": st.joining_date,
        "is_active": u.is_active,
    } for (st, u) in db.execute(stmt)]


def _fees(db: Session, school_id: int, f: dict) -> list[dict]:
    stmt = (
        select(StudentFee, Student, FeeHead, Section, SchoolClass)
        .join(Student, Student.id == StudentFee.student_id)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id, isouter=True)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(StudentFee.school_id == school_id)
        .order_by(StudentFee.due_date)
    )
    if f.get("status"):
        stmt = stmt.where(StudentFee.status == f["status"])
    if f.get("section_id"):
        stmt = stmt.where(Student.section_id == f["section_id"])
    elif f.get("class_id"):
        stmt = stmt.where(Section.class_id == f["class_id"])
    if f.get("due_from"):
        stmt = stmt.where(StudentFee.due_date >= date.fromisoformat(f["due_from"]))
    if f.get("due_to"):
        stmt = stmt.where(StudentFee.due_date <= date.fromisoformat(f["due_to"]))
    return [{
        "admission_no": stu.admission_no,
        "full_name": stu.full_name,
        "class_name": cls.name if cls else None,
        "section_name": sec.name if sec else None,
        "fee_head": head.name if head else None,
        "period": fee.period,
        "amount_due": float(fee.amount_due or 0),
        "amount_paid": float(fee.amount_paid or 0),
        "balance": float((fee.amount_due or 0) - (fee.amount_paid or 0)),
        "due_date": fee.due_date,
        "status": fee.status.value,
    } for (fee, stu, head, sec, cls) in db.execute(stmt)]


def _marks(db: Session, school_id: int, f: dict) -> list[dict]:
    stmt = (
        select(Mark, Student, ExamSubject, Exam, Subject, Section, SchoolClass)
        .join(Student, Student.id == Mark.student_id)
        .join(ExamSubject, ExamSubject.id == Mark.exam_subject_id)
        .join(Exam, Exam.id == ExamSubject.exam_id)
        .join(ClassSubject, ClassSubject.id == ExamSubject.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(Mark.school_id == school_id)
        .order_by(Exam.name, Subject.name, Student.roll_no)
    )
    if f.get("exam_id"):
        stmt = stmt.where(Exam.id == f["exam_id"])
    if f.get("section_id"):
        stmt = stmt.where(Student.section_id == f["section_id"])
    elif f.get("class_id"):
        stmt = stmt.where(Section.class_id == f["class_id"])
    if f.get("only_failed"):
        stmt = stmt.where(Mark.is_pass.is_(False))
    return [{
        "exam_name": exam.name,
        "subject_name": sub.name,
        "admission_no": stu.admission_no,
        "full_name": stu.full_name,
        "class_name": cls.name if cls else None,
        "section_name": sec.name if sec else None,
        "max_marks": paper.max_marks,
        "marks_obtained": float(m.marks_obtained) if m.marks_obtained is not None else None,
        "grade": m.grade,
        "status": m.status.value,
        "is_pass": m.is_pass,
    } for (m, stu, paper, exam, sub, sec, cls) in db.execute(stmt)]


def _attendance(db: Session, school_id: int, f: dict) -> list[dict]:
    """A child per row, with their attendance over the window."""
    present = func.count(StudentAttendance.id).filter(
        StudentAttendance.status.in_([AttendanceStatus.present, AttendanceStatus.late])
    )
    total = func.count(StudentAttendance.id)
    stmt = (
        select(Student, Section, SchoolClass, total.label("marked"), present.label("present"))
        .join(StudentAttendance, StudentAttendance.student_id == Student.id)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .where(Student.school_id == school_id)
        .group_by(Student.id, Section.id, SchoolClass.id)
        .order_by(SchoolClass.name, Section.name, Student.roll_no)
    )
    if f.get("from"):
        stmt = stmt.where(StudentAttendance.date >= date.fromisoformat(f["from"]))
    if f.get("to"):
        stmt = stmt.where(StudentAttendance.date <= date.fromisoformat(f["to"]))
    if f.get("section_id"):
        stmt = stmt.where(Student.section_id == f["section_id"])
    elif f.get("class_id"):
        stmt = stmt.where(Section.class_id == f["class_id"])
    rows = []
    for (stu, sec, cls, marked, seen) in db.execute(stmt):
        pct = round(seen / marked * 100, 1) if marked else 0.0
        if f.get("below_percent") and pct >= float(f["below_percent"]):
            continue
        rows.append({
            "admission_no": stu.admission_no,
            "full_name": stu.full_name,
            "class_name": cls.name if cls else None,
            "section_name": sec.name if sec else None,
            "days_marked": marked,
            "days_present": seen,
            "days_absent": marked - seen,
            "percent": pct,
        })
    return rows


SOURCES: dict[ReportSource, dict[str, Any]] = {
    ReportSource.students: {
        "label": "Students",
        "query": _students,
        "columns": ["admission_no", "full_name", "class_name", "section_name", "roll_no",
                    "gender", "dob", "blood_group", "is_active"],
        "filters": ["academic_year_id", "class_id", "section_id", "status", "gender"],
    },
    ReportSource.staff: {
        "label": "Staff",
        "query": _staff,
        "columns": ["employee_no", "full_name", "email", "phone", "role", "designation",
                    "joining_date", "is_active"],
        "filters": ["role", "status"],
    },
    ReportSource.fees: {
        "label": "Fees",
        "query": _fees,
        "columns": ["admission_no", "full_name", "class_name", "section_name", "fee_head",
                    "period", "amount_due", "amount_paid", "balance", "due_date", "status"],
        "filters": ["class_id", "section_id", "status", "due_from", "due_to"],
    },
    ReportSource.marks: {
        "label": "Marks",
        "query": _marks,
        "columns": ["exam_name", "subject_name", "admission_no", "full_name", "class_name",
                    "section_name", "max_marks", "marks_obtained", "grade", "status", "is_pass"],
        "filters": ["exam_id", "class_id", "section_id", "only_failed"],
    },
    ReportSource.attendance: {
        "label": "Attendance",
        "query": _attendance,
        "columns": ["admission_no", "full_name", "class_name", "section_name",
                    "days_marked", "days_present", "days_absent", "percent"],
        "filters": ["from", "to", "class_id", "section_id", "below_percent"],
    },
}


def catalogue() -> list[dict]:
    return [{"source": s.value, "label": v["label"], "columns": v["columns"], "filters": v["filters"]}
            for s, v in SOURCES.items()]


# ---------- definitions ----------


def get(db: Session, report_id: int, school_id: int) -> ReportDefinition:
    r = db.get(ReportDefinition, report_id)
    if not r or r.school_id != school_id:
        raise _404("Report")
    return r


def _code_taken(db: Session, school_id: int, code: str, ignore_id: Optional[int] = None) -> bool:
    stmt = select(ReportDefinition.id).where(
        ReportDefinition.school_id == school_id, func.lower(ReportDefinition.code) == code.lower()
    )
    if ignore_id:
        stmt = stmt.where(ReportDefinition.id != ignore_id)
    return db.execute(stmt.limit(1)).first() is not None


def _validate(source: ReportSource, columns: list[str], filters: dict, sort_by: Optional[str]) -> None:
    spec = SOURCES[source]
    unknown = [c for c in columns if c not in spec["columns"]]
    if unknown:
        raise _400(f"{spec['label']} has no column called {unknown[0]}")
    bad_filters = [k for k in filters if k not in spec["filters"]]
    if bad_filters:
        raise _400(f"{spec['label']} can't be filtered by {bad_filters[0]}")
    if sort_by and sort_by not in (columns or spec["columns"]):
        raise _400("Sort by one of the columns you picked")


def to_read(db: Session, rows: list[ReportDefinition]) -> list[dict]:
    if not rows:
        return []
    names = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({r.created_by_user_id for r in rows if r.created_by_user_id}))
    ).all()) if any(r.created_by_user_id for r in rows) else {}
    return [{
        "id": r.id,
        "name": r.name,
        "code": r.code,
        "description": r.description,
        "source": r.source,
        "source_label": SOURCES[r.source]["label"],
        "filters": r.filters,
        "columns": r.columns or SOURCES[r.source]["columns"],
        "sort_by": r.sort_by,
        "is_active": r.is_active,
        "created_by_name": names.get(r.created_by_user_id),
        "last_run_at": r.last_run_at,
        "run_count": r.run_count,
    } for r in rows]


def list_reports(db: Session, school_id: int, source: Optional[ReportSource] = None,
                 include_inactive: bool = False) -> list[dict]:
    stmt = select(ReportDefinition).where(ReportDefinition.school_id == school_id)
    if source:
        stmt = stmt.where(ReportDefinition.source == source)
    if not include_inactive:
        stmt = stmt.where(ReportDefinition.is_active.is_(True))
    return to_read(db, list(db.execute(stmt.order_by(ReportDefinition.name)).scalars()))


def create(db: Session, user: User, data: ReportIn) -> ReportDefinition:
    code = data.code.strip()
    if _code_taken(db, user.school_id, code):
        raise _400(f"A report with the code {code} already exists")
    _validate(data.source, data.columns, data.filters, data.sort_by)
    r = ReportDefinition(tenant_id=user.tenant_id, school_id=user.school_id, name=data.name.strip(), code=code,
                         description=data.description, source=data.source, filters=data.filters,
                         columns=data.columns or SOURCES[data.source]["columns"], sort_by=data.sort_by,
                         created_by_user_id=user.id)
    db.add(r)
    db.commit()
    return r


def update(db: Session, user: User, report_id: int, data: ReportUpdate) -> ReportDefinition:
    r = get(db, report_id, user.school_id)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("code"):
        code = fields["code"].strip()
        if _code_taken(db, user.school_id, code, ignore_id=r.id):
            raise _400(f"A report with the code {code} already exists")
        fields["code"] = code
    _validate(r.source, fields.get("columns", r.columns), fields.get("filters", r.filters),
              fields.get("sort_by", r.sort_by))
    for k, v in fields.items():
        setattr(r, k, v)
    db.commit()
    return r


def delete(db: Session, user: User, report_id: int) -> None:
    r = get(db, report_id, user.school_id)
    db.delete(r)
    db.commit()


# ---------- running ----------


def run(db: Session, school_id: int, report: ReportDefinition, extra_filters: Optional[dict] = None,
        limit: Optional[int] = None) -> dict:
    filters = {**(report.filters or {}), **(extra_filters or {})}
    _validate(report.source, report.columns or [], filters, report.sort_by)
    rows = SOURCES[report.source]["query"](db, school_id, filters)
    if report.sort_by:
        rows.sort(key=lambda r: (r.get(report.sort_by) is None, r.get(report.sort_by)))
    columns = report.columns or SOURCES[report.source]["columns"]
    trimmed = [{c: r.get(c) for c in columns} for r in rows]
    report.last_run_at = datetime.now(timezone.utc)
    report.run_count += 1
    db.commit()
    return {
        "report_id": report.id,
        "name": report.name,
        "columns": columns,
        "row_count": len(trimmed),
        "rows": trimmed[:limit] if limit else trimmed,
        "truncated": bool(limit and len(trimmed) > limit),
    }


def _csv(columns: list[str], rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c.replace("_", " ").title() for c in columns])
    for r in rows:
        w.writerow(["" if r.get(c) is None else r[c] for c in columns])
    return buf.getvalue()


def export(db: Session, user: User, report: ReportDefinition, extra_filters: Optional[dict] = None) -> ExportJob:
    """Run the report and keep the CSV, so it can be downloaded again later."""
    job = ExportJob(tenant_id=user.tenant_id, school_id=user.school_id, report_definition_id=report.id,
                    name=report.name, requested_by_user_id=user.id)
    db.add(job)
    db.commit()
    try:
        result = run(db, user.school_id, report, extra_filters)
        body = _csv(result["columns"], result["rows"]).encode("utf-8-sig")
        saved = storage.save_generated(user.school_id, "exports", f"{report.code}.csv", body, "text/csv")
        job.file_key, job.file_name = saved["key"], saved["original_name"]
        job.size_bytes, job.row_count = saved["size_bytes"], result["row_count"]
        job.status = ExportStatus.ready
    except HTTPException as e:
        job.status, job.message = ExportStatus.failed, str(e.detail)
    job.completed_at = datetime.now(timezone.utc)
    db.commit()
    return job


def get_export(db: Session, job_id: int, school_id: int) -> ExportJob:
    j = db.get(ExportJob, job_id)
    if not j or j.school_id != school_id:
        raise _404("Export")
    return j


def export_to_read(db: Session, jobs: list[ExportJob]) -> list[dict]:
    if not jobs:
        return []
    names = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({j.requested_by_user_id for j in jobs if j.requested_by_user_id}))
    ).all()) if any(j.requested_by_user_id for j in jobs) else {}
    return [{
        "id": j.id,
        "report_definition_id": j.report_definition_id,
        "name": j.name,
        "status": j.status,
        "row_count": j.row_count,
        "file_name": j.file_name,
        "size_bytes": j.size_bytes,
        "message": j.message,
        "requested_by_name": names.get(j.requested_by_user_id),
        "created_at": j.created_at,
        "completed_at": j.completed_at,
    } for j in jobs]


def list_exports(db: Session, school_id: int, limit: int = 50) -> list[dict]:
    rows = list(db.execute(
        select(ExportJob).where(ExportJob.school_id == school_id)
        .order_by(ExportJob.created_at.desc()).limit(limit)
    ).scalars())
    return export_to_read(db, rows)


def download(db: Session, job_id: int, school_id: int) -> tuple[ExportJob, bytes]:
    j = get_export(db, job_id, school_id)
    if j.status != ExportStatus.ready or not j.file_key:
        raise _400("That export didn't finish — run the report again")
    return j, storage.read(j.file_key)
