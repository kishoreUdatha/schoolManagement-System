"""End-to-end smoke test for documents + certificates.

Verifies:
    Uploads: type/extension/magic-byte checks; office uploads auto-verified;
      parent uploads pending → verify / reject (reason required); download round-trip.
    Parent can withdraw own unverified upload, not the office's.
    Templates seeded on first use; placeholder syntax validated; preview fills fields.
    Issue bonafide → serial BON/<year>/nnnn, PDF, duplicate-copy counter.
    Parent request → duplicate blocked → office issues → parent downloads PDF.
    TC: blocked by pending dues unless overridden; deactivates student; second TC
      blocked until the first is cancelled.

Run:
    docker exec sms-backend python -m scripts.smoketest_documents
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import FeeStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.document import CertificateIssue, Document
from app.models.fee import FeeHead, StudentFee
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
PARENT_PW = "ParentPass123!"
TEMP_ADM = "SMKDOC01"
HEAD_CODE = "SMKDOC"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


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
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            ctype = r.headers.get("content-type", "")
            if not ctype.startswith("application/json"):
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


def cleanup():
    db = SessionLocal()
    try:
        temp = db.execute(select(Student).where(Student.admission_no == TEMP_ADM)).scalar_one_or_none()
        from app.core import storage

        for d in db.execute(select(Document).where(Document.title.like("Smoke%"))).scalars():
            storage.delete(d.storage_key)
        db.execute(Document.__table__.delete().where(Document.title.like("Smoke%")))
        db.execute(CertificateIssue.__table__.delete().where(CertificateIssue.purpose.like("Smoke%")))
        if temp:
            db.execute(CertificateIssue.__table__.delete().where(CertificateIssue.student_id == temp.id))
            db.execute(StudentFee.__table__.delete().where(StudentFee.student_id == temp.id))
            db.delete(temp)
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD_CODE))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        student, parent = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        temp = Student(
            tenant_id=admin.tenant_id,
            school_id=admin.school_id,
            admission_no=TEMP_ADM,
            full_name="Smoke Leaver",
            dob=date(2015, 8, 21),
            academic_year_id=student.academic_year_id,
            section_id=student.section_id,
            roll_no=900,
            is_active=True,
        )
        db.add(temp)
        head = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke Doc", code=HEAD_CODE)
        db.add(head)
        db.flush()
        db.add(
            StudentFee(
                tenant_id=admin.tenant_id, school_id=admin.school_id, student_id=temp.id,
                fee_structure_id=None, source="smoke", source_id=1, fee_head_id=head.id,
                period="2031-01", amount_due=Decimal("500"), amount_paid=Decimal("0"),
                due_date=date(2031, 1, 10), status=FeeStatus.pending,
            )
        )
        db.commit()
        return student.id, parent.email, temp.id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    section("RESET")
    cleanup()
    sid, parent_email, temp_id = setup()
    tok = login("school", *ADMIN)
    ptok = login("parent", parent_email, PARENT_PW)

    section("Uploads")
    code, err = request("POST", "/school/documents", token=tok, files={"file": ("x.exe", b"MZ")},
                        fields={"owner_type": "student", "owner_id": sid, "category": "other", "title": "Smoke bad"})
    assert code == 400, err
    code, err = request("POST", "/school/documents", token=tok, files={"file": ("fake.pdf", b"not a pdf")},
                        fields={"owner_type": "student", "owner_id": sid, "category": "other", "title": "Smoke fake"})
    assert code == 400 and "match" in err["detail"], err
    code, office = request("POST", "/school/documents", token=tok, files={"file": ("birth.pdf", PDF)},
                           fields={"owner_type": "student", "owner_id": sid, "category": "birth_certificate", "title": "Smoke birth"})
    assert code == 201 and office["verification_status"] == "verified", office
    code, blob = request("GET", f"/school/documents/{office['id']}/file", token=tok)
    assert code == 200 and blob == PDF
    code, school_doc = request("POST", "/school/documents", token=tok, files={"file": ("policy.pdf", PDF)},
                               fields={"owner_type": "school", "category": "policy", "title": "Smoke policy"})
    assert code == 201, school_doc
    print("  type checks hold; office upload verified; bytes round-trip")

    section("Parent uploads + verification")
    code, pdoc = request("POST", f"/parent/me/children/{sid}/documents", token=ptok,
                         files={"file": ("aadhaar.png", PNG)}, fields={"category": "aadhaar", "title": "Smoke aadhaar"})
    assert code == 201 and pdoc["verification_status"] == "pending" and pdoc["uploaded_by_parent"], pdoc
    code, pending = request("GET", "/school/documents?verification=pending", token=tok)
    assert any(d["id"] == pdoc["id"] for d in pending)
    code, err = request("POST", f"/school/documents/{pdoc['id']}/verify", token=tok, body={"status": "rejected"})
    assert code == 400, err
    code, rej = request("POST", f"/school/documents/{pdoc['id']}/verify", token=tok,
                        body={"status": "rejected", "remarks": "Image is blurred"})
    assert code == 200 and rej["verification_status"] == "rejected"
    code, mine = request("GET", f"/parent/me/children/{sid}/documents", token=ptok)
    assert any(d["id"] == pdoc["id"] and d["remarks"] == "Image is blurred" for d in mine), mine
    code, err = request("DELETE", f"/parent/me/children/{sid}/documents/{office['id']}", token=ptok)
    assert code == 400, err
    code, _ = request("DELETE", f"/parent/me/children/{sid}/documents/{pdoc['id']}", token=ptok)
    assert code == 204
    print("  pending → rejected with reason; parent withdrew own upload only")

    section("Templates")
    code, templates = request("GET", "/school/certificates/templates", token=tok)
    assert code == 200 and {t["kind"] for t in templates} >= {"bonafide", "transfer", "character", "study"}, templates
    bon = next(t for t in templates if t["kind"] == "bonafide")
    study = next(t for t in templates if t["kind"] == "study")
    tc = next(t for t in templates if t["kind"] == "transfer")
    code, err = request("PATCH", f"/school/certificates/templates/{bon['id']}", token=tok, body={"body": "Broken {student_name"})
    assert code == 400, err
    code, pv = request("POST", "/school/certificates/preview", token=tok,
                       body={"template_id": bon["id"], "student_id": sid, "purpose": "Smoke passport"})
    assert code == 200 and "Smoke passport" in pv["body"], pv
    print(f"  preview ok; blanks: {pv['missing']}")

    section("Issue bonafide")
    code, cert = request("POST", "/school/certificates", token=tok,
                         body={"template_id": bon["id"], "student_id": sid, "purpose": "Smoke passport"})
    assert code == 201 and cert["status"] == "issued", cert
    assert cert["serial_no"].startswith(f"BON/{date.today().year}/"), cert["serial_no"]
    code, pdf = request("GET", f"/school/certificates/{cert['id']}/pdf", token=tok)
    assert code == 200 and pdf[:4] == b"%PDF"
    code, pdf = request("GET", f"/school/certificates/{cert['id']}/pdf", token=tok)
    code, reg = request("GET", f"/school/certificates?student_id={sid}", token=tok)
    assert next(c for c in reg if c["id"] == cert["id"])["print_count"] == 2
    print(f"  {cert['serial_no']} issued, printed twice")

    section("Parent request")
    code, avail = request("GET", f"/parent/me/children/{sid}/certificates/available", token=ptok)
    assert {t["kind"] for t in avail} == {"bonafide", "study"}, avail
    code, req = request("POST", f"/parent/me/children/{sid}/certificates", token=ptok,
                        body={"template_id": study["id"], "purpose": "Smoke scholarship"})
    assert code == 201 and req["status"] == "requested", req
    code, err = request("POST", f"/parent/me/children/{sid}/certificates", token=ptok,
                        body={"template_id": study["id"], "purpose": "Smoke again"})
    assert code == 409, err
    code, err = request("POST", f"/parent/me/children/{sid}/certificates", token=ptok,
                        body={"template_id": tc["id"], "purpose": "Smoke tc"})
    assert code == 400, err
    code, done = request("POST", f"/school/certificates/{req['id']}/decide", token=tok, body={"approve": True})
    assert code == 200 and done["status"] == "issued" and done["serial_no"].startswith("STU/"), done
    code, pdf = request("GET", f"/parent/me/children/{sid}/certificates/{req['id']}/pdf", token=ptok)
    assert code == 200 and pdf[:4] == b"%PDF"
    print(f"  request → {done['serial_no']} → parent downloaded")

    section("Transfer certificate")
    tc_body = {
        "template_id": tc["id"], "student_id": temp_id, "purpose": "Smoke TC",
        "tc": {"date_of_leaving": date.today().isoformat(), "reason_for_leaving": "Relocation",
               "last_class_studied": "Class 1", "conduct": "Good"},
    }
    code, err = request("POST", "/school/certificates", token=tok, body={**tc_body, "tc": None})
    assert code == 400, err
    code, err = request("POST", "/school/certificates", token=tok, body=tc_body)
    assert code == 400 and "pending" in err["detail"], err
    tc_body["tc"]["allow_with_dues"] = True
    code, tc1 = request("POST", "/school/certificates", token=tok, body=tc_body)
    assert code == 201 and tc1["serial_no"].startswith("TC/"), tc1
    assert "Relocation" in tc1["rendered_body"] and "Twenty-First August" in tc1["rendered_body"], tc1["rendered_body"]
    db = SessionLocal()
    assert db.get(Student, temp_id).is_active is False
    db.close()
    code, err = request("POST", "/school/certificates", token=tok, body=tc_body)
    assert code == 409, err
    code, _ = request("POST", f"/school/certificates/{tc1['id']}/cancel", token=tok, body={"reason": "Wrong date"})
    assert code == 200
    code, pdf = request("GET", f"/school/certificates/{tc1['id']}/pdf", token=tok)
    assert code == 200 and pdf[:4] == b"%PDF"  # renders with CANCELLED watermark
    code, tc2 = request("POST", "/school/certificates", token=tok, body=tc_body)
    assert code == 201 and tc2["serial_no"] != tc1["serial_no"], tc2
    print(f"  dues guard, student deactivated, {tc1['serial_no']} cancelled → {tc2['serial_no']}")

    cleanup()
    print("\nALL DOCUMENT & CERTIFICATE CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        cleanup()
        sys.exit(1)
