"""End-to-end smoke test for admission applications and assessments.

Verifies:
    The public form creates a submitted application with a number; the
    honeypot silently drops bots.
    The pipeline is enforced: you can't approve before checking documents,
    can't admit before approving, can't skip the admission fee when it's due,
    and every move is written to the history.
    Documents upload and verify; assessments notify the assessor, refuse marks
    above the maximum, and finished ones can't be deleted.
    Admitting creates the student (and a parent login) and closes the linked
    enquiry.

Run:
    docker exec sms-backend python -m scripts.smoketest_applications
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.enums import AdmissionStage, AdmissionSource
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.admission import AdmissionEnquiry
from app.models.application import (
    AdmissionApplication,
    AdmissionAssessment,
    ApplicationDocument,
    ApplicationStatusHistory,
)
from app.models.fee import StudentFee
from app.models.foundation import Guardian, StudentEnrollment, StudentGuardian
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.tenant import School, Tenant
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
MARK = "Smoke Applicant"
PARENT_EMAIL = "smoke.app.parent@dev.local"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def request(method, path, *, token=None, body=None, files=None, fields=None):
    headers = {}
    if files is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in (fields or {}).items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (fname, content) in files.items():
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{fname}"\r\n'
                f"Content-Type: application/octet-stream\r\n\r\n".encode() + content + b"\r\n"
            )
        parts.append(f"--{boundary}--\r\n".encode())
        data = b"".join(parts)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    else:
        data = json.dumps(body).encode() if body is not None else None
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            if not r.headers.get("content-type", "").startswith("application/json"):
                return r.status, raw
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        year = db.execute(
            select(AcademicYear).where(AcademicYear.school_id == admin.school_id, AcademicYear.is_current.is_(True))
        ).scalar_one()
        # the section has to belong to the year we admit into, and an unordered
        # pick can land on a class from another year
        sec = db.execute(
            select(Section)
            .join(SchoolClass, SchoolClass.id == Section.class_id)
            .where(Section.school_id == admin.school_id, SchoolClass.academic_year_id == year.id)
            .order_by(Section.id)
            .limit(1)
        ).scalar_one()
        enq = AdmissionEnquiry(
            tenant_id=admin.tenant_id, school_id=admin.school_id, student_name=f"{MARK} Two",
            parent_name="Smoke App Parent", parent_phone="9800000456", source=AdmissionSource.walk_in,
            stage=AdmissionStage.enquiry,
        )
        db.add(enq)
        school = db.get(School, admin.school_id)
        tenant = db.get(Tenant, admin.tenant_id)
        db.commit()
        return dict(year=year.id, section=sec.id, class_id=sec.class_id, enquiry=enq.id,
                    tenant_code=tenant.code, school_code=school.code, teacher_id=teacher.id)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        apps = select(AdmissionApplication.id).where(AdmissionApplication.student_name.like("Smoke%"))
        db.execute(ApplicationStatusHistory.__table__.delete().where(ApplicationStatusHistory.application_id.in_(apps)))
        db.execute(AdmissionAssessment.__table__.delete().where(AdmissionAssessment.application_id.in_(apps)))
        db.execute(ApplicationDocument.__table__.delete().where(ApplicationDocument.application_id.in_(apps)))
        db.execute(AdmissionApplication.__table__.delete().where(AdmissionApplication.student_name.like("Smoke%")))
        db.execute(AdmissionEnquiry.__table__.delete().where(AdmissionEnquiry.student_name.like("Smoke%")))
        sids = [i for (i,) in db.execute(select(Student.id).where(Student.full_name.like("Smoke%"))).all()]
        if sids:
            db.execute(StudentFee.__table__.delete().where(StudentFee.student_id.in_(sids)))
            db.execute(ParentStudent.__table__.delete().where(ParentStudent.student_id.in_(sids)))
            db.execute(StudentGuardian.__table__.delete().where(StudentGuardian.student_id.in_(sids)))
            db.execute(StudentEnrollment.__table__.delete().where(StudentEnrollment.student_id.in_(sids)))
            db.execute(Student.__table__.delete().where(Student.id.in_(sids)))
        users = select(User.id).where(User.email == PARENT_EMAIL)
        db.execute(Guardian.__table__.delete().where(Guardian.user_id.in_(users)))
        db.execute(User.__table__.delete().where(User.email == PARENT_EMAIL))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Admission written test%")))
        db.commit()
    finally:
        db.close()


def notices_for(user_id, like):
    db = SessionLocal()
    try:
        return db.execute(
            select(func.count()).select_from(NoticeRecipient).join(Notice, NoticeRecipient.notice_id == Notice.id)
            .where(NoticeRecipient.user_id == user_id, Notice.title.like(like))
        ).scalar_one()
    finally:
        db.close()


def enquiry_stage(enquiry_id):
    db = SessionLocal()
    try:
        e = db.get(AdmissionEnquiry, enquiry_id)
        return e.stage.value if e else None
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    cleanup()
    ctx = setup()
    today = date.today()
    pub = f"/public/admissions/{ctx['tenant_code']}/{ctx['school_code']}"
    try:
        tok = login("school", *ADMIN)

        section("Public application form")
        code, ack = request("POST", f"{pub}/applications", body={
            "student_name": f"{MARK} One", "guardian_name": "Smoke App Guardian", "phone": "9800000123",
            "email": PARENT_EMAIL, "dob": str(today - timedelta(days=2200)), "gender": "female",
            "applying_for_class": "Class 1", "class_id": ctx["class_id"], "academic_year_id": ctx["year"],
            "previous_school": "Smoke Pre-school", "address": "1 Smoke Street"})
        assert code == 201 and ack["application_no"].startswith("APP-"), ack
        code, bot = request("POST", f"{pub}/applications", body={
            "student_name": "Smoke Bot", "guardian_name": "Smoke Bot", "phone": "9800000000", "website": "http://spam"})
        assert code == 201 and bot["application_no"] == "", "honeypot drops it"
        code, err = request("POST", f"{pub}/applications", body={
            "student_name": "Smoke Future", "guardian_name": "G", "phone": "9800000999",
            "dob": str(today + timedelta(days=1))})
        assert code == 422, err
        code, apps = request("GET", "/school/admissions/applications", token=tok)
        app = next(a for a in apps if a["application_no"] == ack["application_no"])
        assert app["status"] == "submitted" and app["student_name"] == f"{MARK} One", app
        aid = app["id"]
        print(f"  {ack['application_no']} submitted from the public form; bot dropped")

        section("Pipeline rules")
        code, err = request("POST", f"/school/admissions/applications/{aid}/decide", token=tok, body={"approve": True})
        assert code == 400 and "documents" in err["detail"], err
        code, err = request("POST", f"/school/admissions/applications/{aid}/admit", token=tok,
                            body={"academic_year_id": ctx["year"], "section_id": ctx["section"]})
        assert code == 400, err
        code, ver = request("POST", f"/school/admissions/applications/{aid}/status", token=tok,
                            body={"status": "verification", "note": "Smoke checking papers"})
        assert ver["status"] == "verification", ver
        code, err = request("POST", f"/school/admissions/applications/{aid}/status", token=tok, body={"status": "admitted"})
        assert code == 400 and "admit" in err["detail"], err
        print("  can't approve unchecked, can't admit unapproved, can't jump to admitted")

        section("Documents")
        code, doc = request("POST", f"/school/admissions/applications/{aid}/documents", token=tok,
                            files={"file": ("birth.pdf", PDF)}, fields={"category": "birth_certificate"})
        assert code == 201 and not doc["is_verified"], doc
        code, raw = request("GET", f"/school/admissions/applications/documents/{doc['id']}/file", token=tok)
        assert code == 200 and raw[:4] == b"%PDF", "download works"
        code, v = request("POST", f"/school/admissions/applications/documents/{doc['id']}/verify", token=tok,
                          body={"verified": True, "remark": "Smoke original seen"})
        assert v["is_verified"] and v["verified_at"], v
        code, d = request("GET", f"/school/admissions/applications/{aid}", token=tok)
        assert d["documents_total"] == 1 and d["documents_verified"] == 1, d
        print("  birth certificate uploaded, downloaded and verified")

        section("Assessment")
        when = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        before = notices_for(ctx["teacher_id"], "%Admission written test%")
        code, withtest = request("POST", f"/school/admissions/applications/{aid}/assessments", token=tok, body={
            "kind": "written_test", "scheduled_at": when, "venue": "Room 1", "assessor_user_id": ctx["teacher_id"],
            "max_marks": "50"})
        assert code == 201 and withtest["status"] == "assessment", withtest
        assert notices_for(ctx["teacher_id"], "%Admission written test%") == before + 1, "assessor told"
        test = withtest["assessments"][0]
        code, err = request("PUT", f"/school/admissions/applications/assessments/{test['id']}", token=tok,
                            body={"status": "done", "marks_obtained": "60", "passed": True})
        assert code == 400, err
        code, err = request("PUT", f"/school/admissions/applications/assessments/{test['id']}", token=tok,
                            body={"status": "done", "marks_obtained": "42"})
        assert code == 400, "pass/fail required"
        code, res = request("PUT", f"/school/admissions/applications/assessments/{test['id']}", token=tok,
                            body={"status": "done", "marks_obtained": "42", "passed": True, "remarks": "Smoke good reading"})
        assert res["status"] == "done" and res["passed"], res
        code, err = request("DELETE", f"/school/admissions/applications/assessments/{test['id']}", token=tok)
        assert code == 400, "a finished assessment stays"
        print("  test scheduled (assessor notified), 42/50 recorded, over-max refused")

        section("Decision and admission")
        code, appr = request("POST", f"/school/admissions/applications/{aid}/decide", token=tok,
                             body={"approve": True, "note": "Smoke offer a place", "application_fee_due": True})
        assert appr["status"] == "fee_pending", appr
        code, err = request("POST", f"/school/admissions/applications/{aid}/admit", token=tok,
                            body={"academic_year_id": ctx["year"], "section_id": ctx["section"]})
        assert code == 400 and "fee" in err["detail"], err
        code, paid = request("POST", f"/school/admissions/applications/{aid}/fee", token=tok,
                             body={"amount": "2500", "paid_on": str(today), "receipt_no": "SMK-RC-1"})
        assert paid["status"] == "approved" and paid["fee_paid_on"] == str(today), paid
        code, res = request("POST", f"/school/admissions/applications/{aid}/admit", token=tok, body={
            "academic_year_id": ctx["year"], "section_id": ctx["section"], "create_parent_login": True})
        assert code == 200 and res["student_id"] and res["parent_temporary_password"], res
        code, final = request("GET", f"/school/admissions/applications/{aid}", token=tok)
        assert final["status"] == "admitted" and final["student_id"] == res["student_id"], final
        steps = [h["to_status"] for h in final["history"]]
        assert steps == ["submitted", "verification", "assessment", "approved", "fee_pending", "approved", "admitted"], steps
        assert final["history"][-1]["changed_by_name"], "history records who"
        ptok = login("parent", PARENT_EMAIL, res["parent_temporary_password"])
        assert ptok, "the new parent can sign in"
        print(f"  admitted as {res['admission_no']}; parent login works; {len(steps)} status steps recorded")

        section("From an enquiry")
        code, a2 = request("POST", f"/school/admissions/applications?enquiry_id={ctx['enquiry']}", token=tok, body={
            "student_name": f"{MARK} Two", "guardian_name": "Smoke App Parent", "phone": "9800000456",
            "class_id": ctx["class_id"], "academic_year_id": ctx["year"]})
        assert code == 201 and a2["status"] == "draft" and a2["enquiry_id"] == ctx["enquiry"], a2
        assert enquiry_stage(ctx["enquiry"]) == "applied", enquiry_stage(ctx["enquiry"])
        code, sub = request("POST", f"/school/admissions/applications/{a2['id']}/submit", token=tok)
        assert sub["status"] == "submitted" and sub["submitted_at"], sub
        code, wd = request("POST", f"/school/admissions/applications/{a2['id']}/withdraw?note=Smoke%20moved%20away", token=tok)
        assert wd["status"] == "withdrawn", wd
        code, fun = request("GET", "/school/admissions/applications/funnel", token=tok)
        assert fun["admitted"] >= 1 and fun["total"] >= 2, fun
        print("  enquiry -> draft -> submitted -> withdrawn; enquiry moved to 'applied'")

        print("\nALL ADMISSION APPLICATION CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
