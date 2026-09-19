"""End-to-end smoke test for the Admissions module.

Verifies:
    Campaign CRUD with enquiry attribution counts.
    Public enquiry form (school info, submit, honeypot drops bots).
    Admin enquiry create → activity auto-moves stage to contacted.
    Stage change validation (lost needs a reason; enrolled only via convert).
    Follow-up-due filter and stats.
    Convert → Student + parent login created, enquiry enrolled, one-way.

Run:
    docker exec sms-backend python -m scripts.smoketest_admissions
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.admission import AdmissionCampaign, AdmissionEnquiry
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TENANT_CODE = "DEVSCHOOL"
SCHOOL_CODE = "DEVSCHOOL"
MARK = "Smoke Adm"
PARENT_EMAIL = "smoke.adm.parent@dev.local"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def reset_passwords():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one_or_none()
        if u:
            u.password_hash = hash_password(ADMIN[1])
            u.is_active = True
        db.commit()
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        student_ids = [
            sid
            for (sid,) in db.execute(
                select(AdmissionEnquiry.student_id).where(
                    AdmissionEnquiry.student_name.like(f"{MARK}%"),
                    AdmissionEnquiry.student_id.is_not(None),
                )
            ).all()
        ]
        db.execute(
            AdmissionEnquiry.__table__.delete().where(
                AdmissionEnquiry.student_name.like(f"{MARK}%")
            )
        )
        db.execute(
            AdmissionCampaign.__table__.delete().where(
                AdmissionCampaign.name.like(f"{MARK}%")
            )
        )
        if student_ids:
            from app.models.fee import StudentFee

            db.execute(
                ParentStudent.__table__.delete().where(
                    ParentStudent.student_id.in_(student_ids)
                )
            )
            db.execute(
                StudentFee.__table__.delete().where(StudentFee.student_id.in_(student_ids))
            )
            db.execute(Student.__table__.delete().where(Student.id.in_(student_ids)))
        db.execute(User.__table__.delete().where(User.email == PARENT_EMAIL))
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request(
        "POST", f"/{role}/auth/login", body={"email": email, "password": pw}
    )
    assert code == 200, data
    return data["access_token"]


def first_section():
    db = SessionLocal()
    try:
        from app.models.academic import SchoolClass, Section

        row = db.execute(
            select(Section.id, SchoolClass.academic_year_id)
            .join(SchoolClass, Section.class_id == SchoolClass.id)
            .where(Section.school_id == 1)
            .limit(1)
        ).first()
        assert row, "Dev school needs at least one section"
        return row[0], row[1]
    finally:
        db.close()


def main():
    section("RESET + cleanup")
    reset_passwords()
    cleanup()
    token = login("school", *ADMIN)
    today = date.today()

    section("Campaign create")
    code, camp = request(
        "POST",
        "/school/admissions/campaigns",
        token=token,
        body={
            "name": f"{MARK} Open Day",
            "channel": "advertisement",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=30)).isoformat(),
            "budget": "15000.00",
        },
    )
    assert code == 201, camp
    code, bad = request(
        "POST",
        "/school/admissions/campaigns",
        token=token,
        body={
            "name": f"{MARK} bad",
            "start_date": today.isoformat(),
            "end_date": (today - timedelta(days=1)).isoformat(),
        },
    )
    assert code == 422, bad
    print(f"  id={camp['id']}, reversed dates rejected")

    section("Public form")
    code, info = request("GET", f"/public/admissions/{TENANT_CODE.lower()}/{SCHOOL_CODE}")
    assert code == 200, info
    print(f"  school={info['school_name']}")
    code, _ = request("GET", "/public/admissions/nope/nope")
    assert code == 404
    public_body = {
        "student_name": f"{MARK} Web Kid",
        "applying_for_class": "Grade 3",
        "parent_name": "Web Parent",
        "parent_phone": "9800000001",
        "message": "Do you have a bus to Whitefield?",
    }
    code, ack = request(
        "POST", f"/public/admissions/{TENANT_CODE}/{SCHOOL_CODE}/enquiries", body=public_body
    )
    assert code == 201 and ack["ok"], ack
    code, _ = request(
        "POST",
        f"/public/admissions/{TENANT_CODE}/{SCHOOL_CODE}/enquiries",
        body={**public_body, "student_name": f"{MARK} Bot", "website": "http://spam"},
    )
    assert code == 201
    code, page = request(
        "GET", f"/school/admissions/enquiries?search={MARK.replace(' ', '%20')}", token=token
    )
    names = {e["student_name"] for e in page["items"]}
    assert f"{MARK} Web Kid" in names and f"{MARK} Bot" not in names, names
    web = next(e for e in page["items"] if e["student_name"] == f"{MARK} Web Kid")
    assert web["source"] == "website" and "Whitefield" in (web["notes"] or "")
    print("  web enquiry stored, honeypot dropped")

    section("Admin enquiry + activity")
    code, enq = request(
        "POST",
        "/school/admissions/enquiries",
        token=token,
        body={
            "student_name": f"{MARK} Walk In",
            "gender": "female",
            "dob": "2019-04-01",
            "applying_for_class": "Class 1",
            "parent_name": "Smoke Parent",
            "parent_phone": "9800000002",
            "parent_email": PARENT_EMAIL,
            "source": "advertisement",
            "campaign_id": camp["id"],
        },
    )
    assert code == 201, enq
    assert enq["stage"] == "enquiry" and enq["campaign_name"] == f"{MARK} Open Day"
    code, det = request(
        "POST",
        f"/school/admissions/enquiries/{enq['id']}/activities",
        token=token,
        body={
            "kind": "call",
            "note": "Called; visiting Saturday",
            "next_follow_up_date": (today - timedelta(days=1)).isoformat(),
        },
    )
    assert code == 200, det
    assert det["stage"] == "contacted", det["stage"]
    assert len(det["activities"]) == 3  # created, call, auto stage move
    print("  call logged → auto-moved to contacted")

    section("Follow-up due + stats")
    code, due = request(
        "GET", "/school/admissions/enquiries?follow_up_due=true", token=token
    )
    assert enq["id"] in {e["id"] for e in due["items"]}
    code, st = request("GET", "/school/admissions/stats", token=token)
    assert code == 200 and st["follow_ups_due"] >= 1, st
    print(f"  total={st['total']} due={st['follow_ups_due']}")

    section("Stage validation")
    code, err = request(
        "POST",
        f"/school/admissions/enquiries/{enq['id']}/stage",
        token=token,
        body={"stage": "lost"},
    )
    assert code == 422, err
    code, err = request(
        "POST",
        f"/school/admissions/enquiries/{enq['id']}/stage",
        token=token,
        body={"stage": "enrolled"},
    )
    assert code == 422, err
    code, det = request(
        "POST",
        f"/school/admissions/enquiries/{enq['id']}/stage",
        token=token,
        body={"stage": "offered", "note": "Passed interaction"},
    )
    assert code == 200 and det["stage"] == "offered", det

    section("Convert → student + parent")
    section_id, year_id = first_section()
    code, res = request(
        "POST",
        f"/school/admissions/enquiries/{enq['id']}/convert",
        token=token,
        body={"academic_year_id": year_id, "section_id": section_id},
    )
    assert code == 200, res
    assert res["student_id"] and res["parent_user_id"] and res["parent_temporary_password"], res
    print(f"  student={res['admission_no']} parent_user={res['parent_user_id']}")
    code, det = request("GET", f"/school/admissions/enquiries/{enq['id']}", token=token)
    assert det["stage"] == "enrolled" and det["student_id"] == res["student_id"]
    code, again = request(
        "POST",
        f"/school/admissions/enquiries/{enq['id']}/convert",
        token=token,
        body={"academic_year_id": year_id, "section_id": section_id},
    )
    assert code == 400, again
    code, _ = request("DELETE", f"/school/admissions/enquiries/{enq['id']}", token=token)
    assert code == 400
    code, parent_tok = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT_EMAIL, "password": res["parent_temporary_password"]},
    )
    assert code == 200, parent_tok
    print("  parent can log in; re-convert and delete blocked")

    section("Campaign counts")
    code, camps = request("GET", "/school/admissions/campaigns", token=token)
    c = next(x for x in camps if x["id"] == camp["id"])
    assert c["enquiry_count"] == 1 and c["enrolled_count"] == 1, c

    section("Lost with reason")
    web_id = web["id"]
    code, det = request(
        "POST",
        f"/school/admissions/enquiries/{web_id}/stage",
        token=token,
        body={"stage": "lost", "lost_reason": "Chose another school"},
    )
    assert code == 200 and det["lost_reason"] == "Chose another school"
    code, err = request(
        "POST",
        f"/school/admissions/enquiries/{web_id}/convert",
        token=token,
        body={"academic_year_id": year_id, "section_id": section_id},
    )
    assert code == 400, err

    cleanup()
    print("\nALL ADMISSIONS CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
