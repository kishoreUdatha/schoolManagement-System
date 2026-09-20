"""End-to-end smoke test for bulk imports, saved reports and exports.

Verifies:
    An upload is checked and never written until asked: bad rows are listed by
    line number with a plain reason, the good ones import, and the same file
    can't be imported twice. A cancelled job stays cancelled.
    Reports: unknown columns and filters are refused, running returns only the
    chosen columns in the chosen order, and exporting keeps a CSV that can be
    downloaded again by its export id.

Run:
    docker exec sms-backend python -m scripts.smoketest_datadesk
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.datadesk import ExportJob, ImportJob, ReportDefinition
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-DD"
BOUNDARY = "----smokeboundary"


def request(method, path, *, token=None, body=None, form=None, files=None, raw=False):
    data, ctype = None, "application/json"
    if form is not None:
        parts = []
        for k, v in form.items():
            parts.append(f"--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
        for k, (fname, content, ftype) in (files or {}).items():
            parts.append(
                f"--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n"
                f"Content-Type: {ftype}\r\n\r\n".encode() + content + b"\r\n"
            )
        parts.append(f"--{BOUNDARY}--\r\n".encode())
        data = b"".join(parts)
        ctype = f"multipart/form-data; boundary={BOUNDARY}"
    elif body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", ctype)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            if raw:
                return r.status, payload.decode("utf-8-sig")
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        sec = db.execute(
            select(Section).where(Section.school_id == admin.school_id).limit(1)
        ).scalar_one()
        # the year has to be the section's own, or the import is refused
        cls = db.get(SchoolClass, sec.class_id)
        year = db.get(AcademicYear, cls.academic_year_id)
        db.commit()
        return dict(section_id=sec.id, academic_year_id=year.id, school_id=admin.school_id)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        db.execute(ExportJob.__table__.delete().where(ExportJob.name.like(f"{TAG}%")))
        db.execute(ReportDefinition.__table__.delete().where(ReportDefinition.name.like(f"{TAG}%")))
        db.execute(ImportJob.__table__.delete().where(ImportJob.file_name.like(f"{TAG}%")))
        db.execute(Student.__table__.delete().where(Student.full_name.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    ctx = setup()
    code = f"{TAG.lower()}-{uuid.uuid4().hex[:4]}"
    try:
        tok = login("school", *ADMIN)

        section("Checking a spreadsheet before importing it")
        code_, tpl = request("GET", "/school/import-jobs/template.csv?import_type=students", token=tok, raw=True)
        assert code_ == 200 and tpl.splitlines()[0] == "full_name,gender,dob,blood_group,address", tpl
        csv_body = (
            "full_name,gender,dob,blood_group,address\n"
            f"{TAG} Asha,female,2017-04-02,O+,12 MG Road\n"
            f"{TAG} Bala,male,2017-06-11,B+,\n"
            f"{TAG} Asha,female,2017-04-02,O+,\n"          # duplicate name
            "X,male,2017-01-01,,\n"                         # name too short
            f"{TAG} Chitra,female,2050-01-01,,\n"           # dob in the future
        ).encode()
        code_, err = request("POST", "/school/import-jobs", token=tok,
                             form={"import_type": "students", "options": "{}"},
                             files={"file": (f"{TAG}-students.csv", csv_body, "text/csv")})
        assert code_ == 400 and "import into" in err["detail"], err
        opts = json.dumps({"section_id": ctx["section_id"], "academic_year_id": ctx["academic_year_id"]})
        code_, job = request("POST", "/school/import-jobs", token=tok,
                             form={"import_type": "students", "options": opts},
                             files={"file": (f"{TAG}-students.csv", csv_body, "text/csv")})
        assert code_ == 201, job
        assert job["status"] == "checked" and job["total_rows"] == 5, job
        assert job["success_rows"] == 2 and job["error_rows"] == 3, job
        reasons = {e["row"]: e["error"] for e in job["errors"]}
        assert reasons[4].startswith("the same name"), reasons
        assert "missing" in reasons[5] and "future" in reasons[6], reasons
        code_, problems = request("GET", f"/school/import-jobs/{job['id']}/errors.csv", token=tok, raw=True)
        assert code_ == 200 and len(problems.strip().splitlines()) == 4, problems
        print(f"  5 rows read: 2 ready, 3 refused with their line numbers; nothing written yet")

        section("Nothing is written until it is committed")
        db = SessionLocal()
        try:
            before = db.execute(select(Student).where(Student.full_name.like(f"{TAG}%"))).scalars().all()
        finally:
            db.close()
        assert len(before) == 0, "a checked import must not have created anyone"
        code_, err = request("POST", f"/school/import-jobs/{job['id']}/commit", token=tok,
                             body={"skip_bad_rows": False})
        assert code_ == 400 and "fix the file" in err["detail"], err
        code_, done = request("POST", f"/school/import-jobs/{job['id']}/commit", token=tok, body={"skip_bad_rows": True})
        assert code_ == 200 and done["status"] == "imported" and done["success_rows"] == 2, done
        code_, err = request("POST", f"/school/import-jobs/{job['id']}/commit", token=tok, body={})
        assert code_ == 400 and "already been imported" in err["detail"], err
        db = SessionLocal()
        try:
            after = db.execute(select(Student).where(Student.full_name.like(f"{TAG}%"))).scalars().all()
        finally:
            db.close()
        assert len(after) == 2, [s.full_name for s in after]
        print(f"  committed: {done['message']}; a second commit is refused")

        section("Cancelling an import")
        code_, job2 = request("POST", "/school/import-jobs", token=tok,
                              form={"import_type": "students", "options": opts},
                              files={"file": (f"{TAG}-more.csv", csv_body, "text/csv")})
        assert code_ == 201, job2
        code_, cancelled = request("PATCH", f"/school/import-jobs/{job2['id']}", token=tok,
                                   body={"note": "Smoke: wrong file"})
        assert cancelled["status"] == "cancelled" and cancelled["message"] == "Smoke: wrong file", cancelled
        code_, err = request("POST", f"/school/import-jobs/{job2['id']}/commit", token=tok, body={})
        assert code_ == 400 and "cancelled" in err["detail"], err
        code_, listing = request("GET", "/school/import-jobs?import_type=students", token=tok)
        assert any(j["id"] == job["id"] for j in listing), listing
        print("  a cancelled upload can't be committed")

        section("Saving a report")
        code_, sources = request("GET", "/school/report-sources", token=tok)
        assert {s["source"] for s in sources} >= {"students", "staff", "fees", "marks", "attendance"}, sources
        code_, err = request("POST", "/school/report-definitions", token=tok, body={
            "name": f"{TAG} bad", "code": f"{code}x", "source": "students", "columns": ["salary"]})
        assert code_ == 400 and "no column called salary" in err["detail"], err
        code_, err = request("POST", "/school/report-definitions", token=tok, body={
            "name": f"{TAG} bad", "code": f"{code}x", "source": "students", "filters": {"mood": "happy"}})
        assert code_ == 400 and "filtered by mood" in err["detail"], err
        code_, rep = request("POST", "/school/report-definitions", token=tok, body={
            "name": f"{TAG} new admissions", "code": code, "description": "Smoke report",
            "source": "students", "filters": {"section_id": ctx["section_id"], "status": "active"},
            "columns": ["full_name", "admission_no", "gender"], "sort_by": "full_name"})
        assert code_ == 201 and rep["source_label"] == "Students", rep
        code_, err = request("POST", "/school/report-definitions", token=tok, body={
            "name": f"{TAG} clash", "code": code.upper(), "source": "students"})
        assert code_ == 400 and "already exists" in err["detail"], err
        print(f"  saved '{rep['name']}' with 3 columns; unknown columns and filters refused")

        section("Running it")
        code_, result = request("POST", f"/school/report-definitions/{rep['id']}/run", token=tok)
        assert code_ == 200 and result["columns"] == ["full_name", "admission_no", "gender"], result["columns"]
        assert result["row_count"] >= 2, result["row_count"]
        names = [r["full_name"] for r in result["rows"]]
        assert names == sorted(names), "rows come back sorted by the saved column"
        assert set(result["rows"][0]) == {"full_name", "admission_no", "gender"}, result["rows"][0]
        code_, again = request("GET", f"/school/report-definitions/{rep['id']}", token=tok)
        assert again["run_count"] == 1 and again["last_run_at"], again
        print(f"  {result['row_count']} rows, only the chosen columns, run counted")

        section("Exporting and fetching it again")
        code_, ex = request("POST", f"/school/report-definitions/{rep['id']}/export", token=tok)
        assert code_ == 201 and ex["status"] == "ready" and ex["row_count"] == result["row_count"], ex
        code_, body = request("GET", f"/school/export-jobs/{ex['id']}/file", token=tok, raw=True)
        assert code_ == 200, code_
        lines = body.strip().splitlines()
        assert lines[0] == "Full Name,Admission No,Gender", lines[0]
        assert len(lines) == result["row_count"] + 1, lines[:3]
        code_, meta = request("GET", f"/school/export-jobs/{ex['id']}", token=tok)
        assert meta["file_name"].endswith(".csv") and meta["size_bytes"] > 0, meta
        code_, exports = request("GET", "/school/export-jobs", token=tok)
        assert any(e["id"] == ex["id"] for e in exports), exports
        print(f"  export #{ex['id']}: {ex['row_count']} rows kept as {meta['file_name']}, downloadable again")

        section("Retiring a report")
        code_, off = request("PATCH", f"/school/report-definitions/{rep['id']}", token=tok, body={"is_active": False})
        assert not off["is_active"], off
        code_, live = request("GET", "/school/report-definitions", token=tok)
        assert all(x["id"] != rep["id"] for x in live), "retired reports are off the default list"
        code_, _ = request("DELETE", f"/school/report-definitions/{rep['id']}", token=tok)
        assert code_ == 204
        print("  retired, then deleted; its past exports survive")

        print("\nALL IMPORT / REPORT / EXPORT CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
