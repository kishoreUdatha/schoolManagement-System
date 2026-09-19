"""End-to-end smoke test for the front desk (visitors, gate passes, incidents).

Verifies:
    Walk-in check-in issues a pass number and notifies the host; only the last 4
      ID digits are stored; pre-registered visitor checked in later; check-out.
    Parent requests early pickup → office approves → parent gets the code →
      gate verifies the code → release notifies the parent; wrong code 404;
      duplicate request blocked; rejection needs a reason.
    Guard role can't approve passes and doesn't see codes in lists.
    Incident logged and closed; dashboard counters.

Run:
    docker exec sms-backend python -m scripts.smoketest_front_desk
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.enums import UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.notice import Notice
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User
from app.models.visitor import GatePass, SecurityIncident, Visit


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
GUARD = ("smoke.guard@dev.local", "GuardPass123!")
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


def cleanup():
    db = SessionLocal()
    try:
        db.execute(Visit.__table__.delete().where(Visit.visitor_name.like("Smoke%")))
        db.execute(GatePass.__table__.delete().where(GatePass.reason.like("Smoke%")))
        db.execute(SecurityIncident.__table__.delete().where(SecurityIncident.description.like("Smoke%")))
        db.execute(Notice.__table__.delete().where(Notice.body.like("%Smoke%")))
        db.execute(User.__table__.delete().where(User.email == GUARD[0]))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        student, parent = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        db.add(User(
            tenant_id=admin.tenant_id, school_id=admin.school_id, full_name="Smoke Guard",
            email=GUARD[0], password_hash=hash_password(GUARD[1]), role=UserRole.staff, is_active=True,
        ))
        db.commit()
        return student.id, parent.email, teacher.id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, (role, data)
    return data["access_token"]


def inbox(token):
    code, data = request("GET", "/parent/me/notices", token=token)
    return data if isinstance(data, list) else data.get("items", [])


def main():
    cleanup()
    sid, parent_email, teacher_id = setup()
    try:
        tok = login("school", *ADMIN)
        ptok = login("parent", parent_email, PARENT_PW)
        gtok = login("staff", *GUARD)  # non-teaching staff portal
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date()

        section("Visitors")
        code, v = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": "Smoke Vendor", "phone": "9811100000", "id_type": "Aadhaar",
            "id_number": "1234 5678 9012", "company": "Acme Books", "purpose": "vendor",
            "host_user_id": teacher_id, "vehicle_no": "ka01ab1234",
        })
        assert code == 201 and v["status"] == "checked_in" and v["pass_no"].startswith("V"), v
        assert v["id_last4"] == "9012" and v["vehicle_no"] == "KA01AB1234", v
        code, pre = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": "Smoke Parent Meeting", "phone": "9811100001", "purpose": "parent_visit",
            "student_id": sid, "expected_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        })
        assert code == 201 and pre["status"] == "expected" and pre["pass_no"] is None, pre
        code, pre = request("POST", f"/school/front-desk/visits/{pre['id']}/check-in", token=tok)
        assert code == 200 and pre["pass_no"] and pre["pass_no"] != v["pass_no"], pre
        code, inside = request("GET", "/school/front-desk/visits?inside_only=true", token=tok)
        assert {v["id"], pre["id"]} <= {x["id"] for x in inside}
        code, out = request("POST", f"/school/front-desk/visits/{v['id']}/check-out", token=tok)
        assert code == 200 and out["status"] == "checked_out" and out["minutes_inside"] is not None, out
        code, err = request("POST", f"/school/front-desk/visits/{v['id']}/check-out", token=tok)
        assert code == 400, err
        print(f"  passes {v['pass_no']}, {pre['pass_no']}")

        section("Gate pass: parent request → approve → gate")
        body = {"leave_on": today.isoformat(), "leave_time": "12:30", "reason": "Smoke dentist appointment",
                "pickup_name": "Smoke Uncle", "pickup_relation": "Uncle", "pickup_phone": "9811100002"}
        code, req = request("POST", f"/parent/me/children/{sid}/gate-passes", token=ptok, body=body)
        assert code == 201 and req["status"] == "requested", req
        code, dup = request("POST", f"/parent/me/children/{sid}/gate-passes", token=ptok, body=body)
        assert code == 409, dup
        code, err = request("POST", f"/school/front-desk/gate-passes/{req['id']}/decide", token=tok, body={"approve": False})
        assert code == 400, err
        if gtok:
            code, err = request("POST", f"/school/front-desk/gate-passes/{req['id']}/decide", token=gtok, body={"approve": True})
            assert code == 403, err
        code, ok = request("POST", f"/school/front-desk/gate-passes/{req['id']}/decide", token=tok, body={"approve": True})
        assert code == 200 and ok["status"] == "approved", ok
        the_code = ok["code"]
        assert any(the_code in (n.get("body") or "") for n in inbox(ptok)), "parent got the code"
        if gtok:
            code, lst = request("GET", "/school/front-desk/gate-passes", token=gtok)
            assert all(x["code"] is None for x in lst), "guards don't see codes"
        wrong = "000000" if the_code != "000000" else "111111"
        code, err = request("POST", "/school/front-desk/gate-passes/verify", token=gtok or tok, body={"code": wrong})
        assert code == 404, err
        code, found = request("POST", "/school/front-desk/gate-passes/verify", token=gtok or tok, body={"code": the_code})
        assert code == 200 and found["id"] == req["id"] and found["pickup_name"] == "Smoke Uncle", found
        code, gone = request("POST", f"/school/front-desk/gate-passes/{req['id']}/release", token=gtok or tok)
        assert code == 200 and gone["status"] == "departed", gone
        assert any("has left school" in (n.get("title") or "") for n in inbox(ptok)), "departure notice"
        code, err = request("POST", f"/school/front-desk/gate-passes/{req['id']}/release", token=tok)
        assert code == 400, err
        print(f"  code {the_code} verified; released; parent notified")

        section("Incidents + dashboard")
        code, inc = request("POST", "/school/front-desk/incidents", token=gtok or tok, body={
            "occurred_at": datetime.now(timezone.utc).isoformat(), "location": "Main gate",
            "category": "Unauthorised entry", "severity": "medium", "description": "Smoke: stranger tried to enter",
        })
        assert code == 201, inc
        code, closed = request("PATCH", f"/school/front-desk/incidents/{inc['id']}", token=tok,
                               body={"action_taken": "Escorted out", "is_closed": True})
        assert code == 200 and closed["is_closed"], closed
        code, dash = request("GET", "/school/front-desk/dashboard", token=tok)
        assert dash["inside_now"] >= 1 and dash["gate_passes_today"] >= 1, dash
        print(f"  {dash}")

        print("\nALL FRONT DESK CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
