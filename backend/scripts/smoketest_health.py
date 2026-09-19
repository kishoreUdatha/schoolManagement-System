"""End-to-end smoke test for health / infirmary.

Verifies:
    Medical profile saved by the office and updated by a parent; alerts list.
    Checkup BMI; future dates rejected.
    Clinic visit → parent gets an in-app notice; 'sent home' always notifies even
      when the nurse unticks it; allergies shown on the visit.
    Immunization due list; parent sees the whole record.

Run:
    docker exec sms-backend python -m scripts.smoketest_health
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.health import ClinicVisit, HealthCheckup, Immunization, MedicalProfile
from app.models.notice import Notice
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
PARENT_PW = "ParentPass123!"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
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


def snapshot_and_setup():
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
        existing = db.execute(select(MedicalProfile).where(MedicalProfile.student_id == student.id)).scalar_one_or_none()
        saved = {c.name: getattr(existing, c.name) for c in MedicalProfile.__table__.columns} if existing else None
        db.commit()
        return student.id, parent.email, saved
    finally:
        db.close()


def cleanup(sid, saved_profile):
    db = SessionLocal()
    try:
        db.execute(ClinicVisit.__table__.delete().where(ClinicVisit.complaint.like("Smoke%")))
        db.execute(HealthCheckup.__table__.delete().where(HealthCheckup.notes == "Smoke"))
        db.execute(Immunization.__table__.delete().where(Immunization.notes == "Smoke"))
        db.execute(Notice.__table__.delete().where(Notice.body.like("%Smoke%")))
        db.execute(MedicalProfile.__table__.delete().where(MedicalProfile.student_id == sid))
        if saved_profile:
            db.execute(MedicalProfile.__table__.insert().values(**saved_profile))
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    sid, parent_email, saved = snapshot_and_setup()
    try:
        tok = login("school", *ADMIN)
        ptok = login("parent", parent_email, PARENT_PW)

        section("Profile + alerts")
        code, p = request("PUT", f"/school/health/students/{sid}/profile", token=tok,
                          body={"allergies": "Peanuts (anaphylaxis)", "emergency_contact_phone": "9800000009"})
        assert code == 200 and p["allergies"].startswith("Peanuts"), p
        code, p = request("PUT", f"/parent/me/children/{sid}/health/profile", token=ptok,
                          body={"current_medications": "Inhaler as needed"})
        assert code == 200 and p["allergies"].startswith("Peanuts") and p["current_medications"], "partial update keeps other fields"
        code, al = request("GET", "/school/health/alerts", token=tok)
        assert any(a["student_id"] == sid for a in al), al

        section("Checkups")
        code, err = request("POST", f"/school/health/students/{sid}/checkups", token=tok,
                            body={"checked_on": (date.today() + timedelta(days=1)).isoformat(), "notes": "Smoke"})
        assert code == 400, err
        code, c = request("POST", f"/school/health/students/{sid}/checkups", token=tok,
                          body={"checked_on": date.today().isoformat(), "height_cm": "125", "weight_kg": "25", "notes": "Smoke"})
        assert code == 201 and Decimal(c["bmi"]) == Decimal("16.0"), c
        print(f"  BMI {c['bmi']}")

        section("Clinic visits + parent notice")
        code, v1 = request("POST", "/school/health/visits", token=tok,
                           body={"student_id": sid, "complaint": "Smoke headache", "outcome": "back_to_class", "notify_parent": False})
        assert code == 201 and v1["parent_notified"] is False and v1["allergies"].startswith("Peanuts"), v1
        code, v2 = request("POST", "/school/health/visits", token=tok,
                           body={"student_id": sid, "complaint": "Smoke fever", "temperature_c": "38.6",
                                 "medicine_given": "Paracetamol 250mg", "outcome": "sent_home", "notify_parent": False})
        assert code == 201 and v2["parent_notified"] is True, "sent home must always notify"
        code, inbox = request("GET", "/parent/me/notices", token=ptok)
        items = inbox if isinstance(inbox, list) else inbox.get("items", [])
        assert any("Smoke fever" in (n.get("body") or "") for n in items), items[:3]
        code, today = request("GET", f"/school/health/visits?on={date.today().isoformat()}", token=tok)
        assert {v1["id"], v2["id"]} <= {v["id"] for v in today}
        code, dash = request("GET", "/school/health/dashboard", token=tok)
        assert dash["visits_today"] >= 2 and dash["sent_home_today"] >= 1, dash
        print(f"  dashboard: {dash}")

        section("Immunizations + parent record")
        code, i = request("POST", f"/school/health/students/{sid}/immunizations", token=tok,
                          body={"vaccine": "Typhoid", "dose": "Booster", "given_on": "2024-01-10",
                                "next_due_on": (date.today() + timedelta(days=10)).isoformat(), "notes": "Smoke"})
        assert code == 201, i
        code, due = request("GET", "/school/health/immunizations-due", token=tok)
        assert any(d["id"] == i["id"] for d in due), due
        code, rec = request("GET", f"/parent/me/children/{sid}/health", token=ptok)
        assert code == 200 and len(rec["visits"]) >= 2 and rec["immunizations"] and rec["checkups"], rec.keys()

        print("\nALL HEALTH CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        cleanup(sid, saved)


if __name__ == "__main__":
    main()
