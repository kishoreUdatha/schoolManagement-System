"""Bulk imports from a spreadsheet.

Every upload is checked before anything is written: the office gets the list of
bad rows (with the line number and what's wrong), fixes the file or accepts the
loss, and only then commits. A committed job can't be run twice.

Types: students into a section, staff, and marks for one exam paper.
"""
import csv
import io
from datetime import date, datetime, timezone
from typing import Any, Callable, Optional, get_args

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core import storage
from app.core.enums import Gender, ImportStatus, ImportType, MarkStatus
from app.models.academic import Section
from app.models.datadesk import ImportJob
from app.models.exam import Exam, ExamSubject
from app.models.mark import Mark
from app.models.student import Student
from app.models.subject import ClassSubject
from app.models.user import User
from app.schemas.staff import StaffCreate, StaffRole
from app.schemas.student import StudentBulkRow
from app.services import mark_service, staff_service, student_service


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


# import type -> (columns, what the options must carry)
TEMPLATES: dict[ImportType, dict[str, Any]] = {
    ImportType.students: {
        "columns": ["full_name", "gender", "dob", "blood_group", "address"],
        "sample": [["Aarav Sharma", "male", "2018-05-12", "O+", "12 MG Road Bengaluru"]],
        "needs": ["academic_year_id", "section_id"],
        "help": "One row per child. They all go into the section you pick.",
    },
    ImportType.staff: {
        "columns": ["full_name", "email", "phone", "role", "employee_no", "designation", "joining_date"],
        "sample": [["Meera Iyer", "meera@school.test", "9800000001", "teacher", "EMP101", "Maths teacher", "2024-06-01"]],
        "needs": [],
        "help": "Each person gets a login and a temporary password to hand over.",
    },
    ImportType.marks: {
        "columns": ["admission_no", "marks", "status", "remark"],
        "sample": [["ADM0001", "37", "scored", ""], ["ADM0002", "", "absent", "Was ill"]],
        "needs": ["exam_subject_id", "section_id"],
        "help": "Leave marks blank for absent or exempt. Admission numbers must match.",
    },
}


def template_csv(import_type: ImportType) -> str:
    t = TEMPLATES[import_type]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(t["columns"])
    w.writerows(t["sample"])
    return buf.getvalue()


def _rows(job: ImportJob) -> list[dict[str, str]]:
    text = storage.read(job.file_key).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    wanted = TEMPLATES[job.import_type]["columns"]
    if not reader.fieldnames:
        raise _400("That file has no header row")
    missing = [c for c in wanted if c not in [f.strip() for f in reader.fieldnames]]
    if missing:
        raise _400(f"The file is missing these columns: {', '.join(missing)}")
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


# ---------- checking ----------


def _date(value: str, field: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{field} must look like 2018-05-12")


def _check_students(db: Session, job: ImportJob, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    sec = db.get(Section, job.options.get("section_id"))
    if not sec or sec.school_id != job.school_id:
        raise _404("Section")
    seen: set[str] = set()
    existing = {
        n.lower() for n in db.execute(
            select(Student.full_name).where(Student.section_id == sec.id, Student.is_active.is_(True))
        ).scalars()
    }
    ok, bad = [], []
    for i, r in enumerate(rows, start=2):  # row 1 is the header
        name = r.get("full_name", "")
        try:
            if len(name) < 2:
                raise ValueError("full_name is missing")
            if name.lower() in seen:
                raise ValueError("the same name appears twice in this file")
            if name.lower() in existing:
                raise ValueError("a child with this name is already in the section")
            gender = r.get("gender", "").lower()
            if gender and gender not in {g.value for g in Gender}:
                raise ValueError(f"gender must be one of {', '.join(g.value for g in Gender)}")
            dob = _date(r.get("dob", ""), "dob")
            if dob and dob > date.today():
                raise ValueError("dob is in the future")
        except ValueError as e:
            bad.append({"row": i, "value": name or "(blank)", "error": str(e)})
            continue
        seen.add(name.lower())
        ok.append({"row": i, "data": StudentBulkRow(
            full_name=name, gender=gender or None, dob=dob,
            blood_group=r.get("blood_group") or None, address=r.get("address") or None,
        )})
    return ok, bad


def _check_staff(db: Session, job: ImportJob, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    roles = set(get_args(StaffRole))
    emails = {e.lower() for e in db.execute(
        select(User.email).where(User.tenant_id == job.tenant_id)
    ).scalars()}
    seen_email: set[str] = set()
    seen_emp: set[str] = set()
    ok, bad = [], []
    for i, r in enumerate(rows, start=2):
        email = r.get("email", "").lower()
        try:
            if len(r.get("full_name", "")) < 2:
                raise ValueError("full_name is missing")
            if "@" not in email or "." not in email.split("@")[-1]:
                raise ValueError("email doesn't look like an email address")
            if email in emails:
                raise ValueError("someone already uses this email")
            if email in seen_email:
                raise ValueError("the same email appears twice in this file")
            if not r.get("employee_no"):
                raise ValueError("employee_no is missing")
            if r["employee_no"] in seen_emp:
                raise ValueError("the same employee_no appears twice in this file")
            role = (r.get("role") or "teacher").lower()
            if role not in roles:
                raise ValueError(f"role must be one of {', '.join(sorted(roles))}")
            joining = _date(r.get("joining_date", ""), "joining_date")
        except ValueError as e:
            bad.append({"row": i, "value": email or r.get("full_name") or "(blank)", "error": str(e)})
            continue
        seen_email.add(email)
        seen_emp.add(r["employee_no"])
        ok.append({"row": i, "data": StaffCreate(
            full_name=r["full_name"], email=email, phone=r.get("phone") or None, role=role,
            employee_no=r["employee_no"], designation=r.get("designation") or None, joining_date=joining,
        )})
    return ok, bad


def _paper(db: Session, job: ImportJob) -> tuple[ExamSubject, Exam]:
    paper = db.get(ExamSubject, job.options.get("exam_subject_id"))
    if not paper or paper.school_id != job.school_id:
        raise _404("Exam paper")
    exam = db.get(Exam, paper.exam_id)
    return paper, exam


def _check_marks(db: Session, job: ImportJob, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    paper, exam = _paper(db, job)
    if exam.is_published:
        raise _400("That exam is published — marks are locked until it is unpublished")
    sec = db.get(Section, job.options.get("section_id"))
    cs = db.get(ClassSubject, paper.class_subject_id)
    if not sec or sec.school_id != job.school_id or sec.class_id != cs.class_id:
        raise _400("That section doesn't take this paper")
    roster = {s.admission_no: s.id for s in db.execute(
        select(Student).where(Student.section_id == sec.id, Student.is_active.is_(True))
    ).scalars()}
    seen: set[str] = set()
    ok, bad = [], []
    for i, r in enumerate(rows, start=2):
        adm = r.get("admission_no", "")
        try:
            if adm not in roster:
                raise ValueError("no active child in this section has that admission number")
            if adm in seen:
                raise ValueError("this admission number appears twice in this file")
            state = (r.get("status") or "scored").lower()
            if state not in {m.value for m in MarkStatus}:
                raise ValueError(f"status must be one of {', '.join(m.value for m in MarkStatus)}")
            value = None
            if state == MarkStatus.scored.value:
                if not r.get("marks"):
                    raise ValueError("marks are needed unless the child was absent or exempt")
                try:
                    value = float(r["marks"])
                except ValueError:
                    raise ValueError("marks must be a number")
                if value < 0 or value > paper.max_marks:
                    raise ValueError(f"marks must be between 0 and {paper.max_marks}")
        except ValueError as e:
            bad.append({"row": i, "value": adm or "(blank)", "error": str(e)})
            continue
        seen.add(adm)
        ok.append({"row": i, "data": {"student_id": roster[adm], "status": state, "marks": value,
                                      "remark": r.get("remark") or None}})
    return ok, bad


CHECKERS: dict[ImportType, Callable] = {
    ImportType.students: _check_students,
    ImportType.staff: _check_staff,
    ImportType.marks: _check_marks,
}


# ---------- committing ----------


def _commit_students(db: Session, job: ImportJob, ok: list[dict]) -> tuple[int, list[dict]]:
    created, errors = student_service.bulk_create(
        db, job.tenant_id, job.school_id, job.options["academic_year_id"], job.options["section_id"],
        [r["data"] for r in ok],
    )
    rows = [{"row": ok[e["row"]]["row"] if isinstance(e.get("row"), int) and e["row"] < len(ok) else None,
             "value": e.get("full_name"), "error": e.get("error")} for e in errors]
    return len(created), rows


def _commit_staff(db: Session, job: ImportJob, ok: list[dict]) -> tuple[int, list[dict]]:
    done, errors = 0, []
    for r in ok:
        try:
            staff_service.create_staff(db, job.tenant_id, job.school_id, r["data"])
            done += 1
        except HTTPException as e:
            errors.append({"row": r["row"], "value": r["data"].email, "error": str(e.detail)})
    return done, errors


def _commit_marks(db: Session, job: ImportJob, ok: list[dict]) -> tuple[int, list[dict]]:
    paper, exam = _paper(db, job)
    now = datetime.now(timezone.utc)
    for r in ok:
        d = r["data"]
        if d["status"] == MarkStatus.scored.value:
            grade, is_pass = mark_service._grade_and_pass(db, exam, d["marks"], paper.max_marks, paper.pass_marks)
            value = d["marks"]
        elif d["status"] == MarkStatus.absent.value:
            value, grade, is_pass = 0, None, False
        else:
            value, grade, is_pass = None, None, None
        db.execute(
            pg_insert(Mark.__table__)
            .values(tenant_id=job.tenant_id, school_id=job.school_id, exam_subject_id=paper.id,
                    student_id=d["student_id"], status=d["status"], marks_obtained=value, grade=grade,
                    is_pass=is_pass, remark=d["remark"], marked_by_user_id=job.created_by_user_id, marked_at=now)
            .on_conflict_do_update(
                constraint="uq_mark_per_paper_student",
                set_={"status": d["status"], "marks_obtained": value, "grade": grade, "is_pass": is_pass,
                      "remark": d["remark"], "marked_by_user_id": job.created_by_user_id, "marked_at": now},
            )
        )
    return len(ok), []


COMMITTERS: dict[ImportType, Callable] = {
    ImportType.students: _commit_students,
    ImportType.staff: _commit_staff,
    ImportType.marks: _commit_marks,
}


# ---------- the job ----------


def get(db: Session, job_id: int, school_id: int) -> ImportJob:
    job = db.get(ImportJob, job_id)
    if not job or job.school_id != school_id:
        raise _404("Import")
    return job


def to_read(db: Session, jobs: list[ImportJob]) -> list[dict]:
    if not jobs:
        return []
    names = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({j.created_by_user_id for j in jobs if j.created_by_user_id}))
    ).all()) if any(j.created_by_user_id for j in jobs) else {}
    return [{
        "id": j.id,
        "import_type": j.import_type,
        "status": j.status,
        "file_name": j.file_name,
        "options": j.options,
        "total_rows": j.total_rows,
        "success_rows": j.success_rows,
        "error_rows": j.error_rows,
        "errors": j.errors,
        "message": j.message,
        "created_by_name": names.get(j.created_by_user_id),
        "created_at": j.created_at,
        "completed_at": j.completed_at,
    } for j in jobs]


def list_jobs(db: Session, school_id: int, import_type: Optional[ImportType] = None, limit: int = 50) -> list[dict]:
    stmt = select(ImportJob).where(ImportJob.school_id == school_id)
    if import_type:
        stmt = stmt.where(ImportJob.import_type == import_type)
    return to_read(db, list(db.execute(stmt.order_by(ImportJob.created_at.desc()).limit(limit)).scalars()))


def create(db: Session, user: User, import_type: ImportType, options: dict, file: UploadFile) -> ImportJob:
    """Store the file and check it straight away — nothing is written yet."""
    missing = [k for k in TEMPLATES[import_type]["needs"] if not options.get(k)]
    if missing:
        raise _400(f"Tell us the {', '.join(missing).replace('_id', '')} to import into")
    saved = storage.save_csv_upload(user.school_id, "imports", file)
    job = ImportJob(tenant_id=user.tenant_id, school_id=user.school_id, import_type=import_type,
                    file_key=saved["key"], file_name=saved["original_name"], options=options,
                    created_by_user_id=user.id, started_at=datetime.now(timezone.utc))
    db.add(job)
    db.commit()
    return check(db, job)


def check(db: Session, job: ImportJob) -> ImportJob:
    rows = _rows(job)
    if not rows:
        raise _400("That file has a header but no rows")
    ok, bad = CHECKERS[job.import_type](db, job, rows)
    job.total_rows, job.success_rows, job.error_rows = len(rows), len(ok), len(bad)
    job.errors = bad
    job.status = ImportStatus.checked
    job.message = (
        f"{len(ok)} of {len(rows)} rows are ready to import"
        + (f"; {len(bad)} have problems" if bad else "")
    )
    db.commit()
    return job


def commit(db: Session, user: User, job_id: int, skip_bad_rows: bool = True) -> ImportJob:
    job = get(db, job_id, user.school_id)
    if job.status == ImportStatus.imported:
        raise _400("This file has already been imported")
    if job.status == ImportStatus.cancelled:
        raise _400("This import was cancelled")
    if job.status != ImportStatus.checked:
        raise _400("Check the file first")
    if job.error_rows and not skip_bad_rows:
        raise _400(f"{job.error_rows} rows have problems — fix the file or import the good rows only")
    ok, bad = CHECKERS[job.import_type](db, job, _rows(job))
    if not ok:
        raise _400("There isn't a single row worth importing")
    written, failures = COMMITTERS[job.import_type](db, job, ok)
    db.commit()
    job.success_rows = written
    job.error_rows = len(bad) + len(failures)
    job.errors = bad + [f for f in failures if f]
    job.status = ImportStatus.imported if written else ImportStatus.failed
    job.completed_at = datetime.now(timezone.utc)
    job.message = f"Imported {written} of {job.total_rows} rows"
    db.commit()
    return job


def cancel(db: Session, user: User, job_id: int, note: Optional[str] = None) -> ImportJob:
    job = get(db, job_id, user.school_id)
    if job.status == ImportStatus.imported:
        raise _400("This file has already been imported")
    job.status = ImportStatus.cancelled
    job.message = note or "Cancelled"
    job.completed_at = datetime.now(timezone.utc)
    db.commit()
    return job


def errors_csv(db: Session, job_id: int, school_id: int) -> str:
    job = get(db, job_id, school_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["row", "value", "problem"])
    for e in job.errors:
        w.writerow([e.get("row"), e.get("value"), e.get("error")])
    return buf.getvalue()
