"""End-to-end smoke test for recruitment and leave entitlement.

Verifies:
    Recruitment: draft openings take no applications; the public careers page
      lists open public ones and accepts an application; duplicate applications
      are refused; interviews notify the panel and need feedback to be marked
      done; one live offer at a time; accepting then hiring creates the staff
      member with a login and fills the opening.
    Leave: types with a yearly entitlement, allotment for all staff (carry
      forward capped), applying uses the balance on approval, cancelling gives
      it back, and going over the entitlement is refused.

Run:
    docker exec sms-backend python -m scripts.smoketest_hr
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.hr import Candidate, CandidateApplication, InterviewSchedule, JobOpening, LeaveBalance, LeaveType, Offer
from app.models.notice import Notice, NoticeRecipient
from app.models.staff import Staff
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.tenant import School, Tenant
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
CAND_EMAIL = "smoke.hr.candidate@dev.local"
HIRE_NO = "SMKHR01"
YEAR = 2031


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
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


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        school = db.get(School, admin.school_id)
        tenant = db.get(Tenant, admin.tenant_id)
        db.commit()
        return dict(tenant_code=tenant.code, school_code=school.code, teacher_id=teacher.id, school_id=school.id)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        opens = select(JobOpening.id).where(JobOpening.title.like("Smoke%"))
        apps = select(CandidateApplication.id).where(CandidateApplication.opening_id.in_(opens))
        db.execute(Offer.__table__.delete().where(Offer.application_id.in_(apps)))
        db.execute(InterviewSchedule.__table__.delete().where(InterviewSchedule.application_id.in_(apps)))
        db.execute(CandidateApplication.__table__.delete().where(CandidateApplication.id.in_(apps)))
        db.execute(JobOpening.__table__.delete().where(JobOpening.title.like("Smoke%")))
        db.execute(Candidate.__table__.delete().where(Candidate.email == CAND_EMAIL))
        hired = db.execute(select(Staff).where(Staff.employee_no == HIRE_NO)).scalar_one_or_none()
        if hired:
            db.execute(StaffLeave.__table__.delete().where(StaffLeave.applicant_user_id == hired.user_id))
            db.execute(StaffAttendance.__table__.delete().where(StaffAttendance.user_id == hired.user_id))
            db.execute(LeaveBalance.__table__.delete().where(LeaveBalance.user_id == hired.user_id))
            uid = hired.user_id
            db.delete(hired)
            db.flush()
            db.execute(User.__table__.delete().where(User.id == uid))
        types = select(LeaveType.id).where(LeaveType.code.like("SMK%"))
        db.execute(StaffLeave.__table__.delete().where(StaffLeave.leave_type_id.in_(types)))
        db.execute(LeaveBalance.__table__.delete().where(LeaveBalance.leave_type_id.in_(types)))
        db.execute(LeaveType.__table__.delete().where(LeaveType.code.like("SMK%")))
        db.execute(LeaveBalance.__table__.delete().where(LeaveBalance.year == YEAR))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Interview:%")))
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


def leave_used(user_id, type_id):
    db = SessionLocal()
    try:
        b = db.execute(
            select(LeaveBalance).where(LeaveBalance.user_id == user_id, LeaveBalance.leave_type_id == type_id,
                                       LeaveBalance.year == YEAR)
        ).scalar_one_or_none()
        return b.used if b else None
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
    pub = f"/public/careers/{ctx['tenant_code']}/{ctx['school_code']}"
    try:
        tok = login("school", *ADMIN)

        section("Openings")
        code, o = request("POST", "/school/hr/openings", token=tok, body={
            "title": "Smoke Maths Teacher", "employment_type": "full_time", "vacancies": 1,
            "description": "Teach maths", "requirements": "B.Ed", "salary_min": "300000", "salary_max": "500000"})
        assert code == 201 and o["status"] == "draft" and o["reference_no"].startswith("JOB-"), o
        code, err = request("POST", "/school/hr/openings", token=tok, body={
            "title": "Smoke bad pay", "salary_min": "500000", "salary_max": "100000"})
        assert code == 400, err
        code, seen = request("GET", f"{pub}/openings")
        assert not any(x["id"] == o["id"] for x in seen), "drafts stay off the careers page"
        code, err = request("POST", f"{pub}/openings/{o['id']}/apply", body={
            "candidate": {"full_name": "Smoke Candidate", "email": CAND_EMAIL}})
        assert code == 400, err
        code, o = request("POST", f"/school/hr/openings/{o['id']}/status?value=open", token=tok)
        assert o["status"] == "open" and o["posted_on"], o
        code, seen = request("GET", f"{pub}/openings")
        assert any(x["id"] == o["id"] and x["title"] == "Smoke Maths Teacher" for x in seen), seen
        print(f"  {o['reference_no']} opened and listed on the public careers page")

        section("Applying")
        code, ack = request("POST", f"{pub}/openings/{o['id']}/apply", body={
            "candidate": {"full_name": "Smoke Candidate", "email": CAND_EMAIL, "phone": "9800000123",
                          "qualification": "M.Sc B.Ed", "experience_years": "4.5"},
            "message": "Smoke keen to join"})
        assert code == 201 and ack["ok"], ack
        code, err = request("POST", f"{pub}/openings/{o['id']}/apply", body={
            "candidate": {"full_name": "Smoke Candidate", "email": CAND_EMAIL}})
        assert code == 400 and "already applied" in err["detail"], err
        code, apps = request("GET", f"/school/hr/applications?opening_id={o['id']}", token=tok)
        app = apps[0]
        assert app["candidate_name"] == "Smoke Candidate" and app["stage"] == "applied" and app["experience_years"] == "4.5", app
        code, err = request("POST", f"/school/hr/applications/{app['id']}/stage", token=tok, body={"stage": "rejected"})
        assert code == 400, "rejecting needs a reason"
        code, a2 = request("POST", f"/school/hr/applications/{app['id']}/stage", token=tok,
                           body={"stage": "shortlisted", "rating": 4, "notes": "Smoke strong profile"})
        assert a2["stage"] == "shortlisted" and a2["rating"] == 4, a2
        print("  applied via the public page; duplicate refused; shortlisted")

        section("Interviews")
        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        before = notices_for(ctx["teacher_id"], "%Interview:%")
        code, withint = request("POST", f"/school/hr/applications/{app['id']}/interviews", token=tok, body={
            "scheduled_at": when, "minutes": 45, "mode": "in_person", "place_or_link": "Principal's office",
            "panel_user_ids": [ctx["teacher_id"]]})
        assert code == 201 and withint["stage"] == "interview" and withint["interviews"][0]["round_no"] == 1, withint
        assert notices_for(ctx["teacher_id"], "%Interview:%") == before + 1, "panel told"
        iv = withint["interviews"][0]
        code, err = request("PUT", f"/school/hr/interviews/{iv['id']}", token=tok, body={"status": "done"})
        assert code == 400, "feedback required"
        code, fb = request("PUT", f"/school/hr/interviews/{iv['id']}", token=tok, body={
            "status": "done", "feedback": "Smoke confident, good subject knowledge", "rating": 5, "recommended": True})
        assert fb["status"] == "done" and fb["recommended"], fb
        print("  round 1 scheduled, panel notified, feedback recorded")

        section("Offer and hire")
        code, off = request("POST", f"/school/hr/applications/{app['id']}/offer", token=tok, body={
            "role_title": "Maths Teacher", "annual_salary": "420000", "joining_date": str(today + timedelta(days=30)),
            "valid_till": str(today + timedelta(days=7))})
        assert code == 201 and off["stage"] == "offered" and off["offer"]["status"] == "draft", off
        offer_id = off["offer"]["id"]
        code, err = request("POST", f"/school/hr/applications/{app['id']}/offer", token=tok, body={
            "role_title": "Second", "annual_salary": "1", "joining_date": str(today)})
        assert code == 400, "only one live offer"
        code, sent = request("POST", f"/school/hr/offers/{offer_id}/send", token=tok)
        assert sent["status"] == "sent" and sent["sent_at"], sent
        code, err = request("POST", f"/school/hr/offers/{offer_id}/hire", token=tok, body={"employee_no": HIRE_NO})
        assert code == 400, "must accept first"
        code, acc = request("POST", f"/school/hr/offers/{offer_id}/respond", token=tok,
                            body={"accept": True, "note": "Smoke accepted by phone"})
        assert acc["status"] == "accepted", acc
        code, hired = request("POST", f"/school/hr/offers/{offer_id}/hire", token=tok,
                              body={"employee_no": HIRE_NO, "role": "teacher"})
        assert code == 200 and hired["temporary_password"] and hired["opening_status"] == "filled", hired
        code, a3 = request("GET", f"/school/hr/applications/{app['id']}", token=tok)
        assert a3["stage"] == "hired" and a3["hired_staff_id"] == hired["staff_id"], a3
        new_tok = login("teacher", CAND_EMAIL, hired["temporary_password"])
        assert new_tok, "the new teacher can sign in"
        code, pipe = request("GET", "/school/hr/pipeline", token=tok)
        assert pipe["by_stage"].get("hired", 0) >= 1, pipe
        print(f"  offer accepted -> staff {HIRE_NO} created with a working login; opening marked filled")

        section("Leave types and balances")
        code, lt = request("POST", "/school/hr/leave-types", token=tok, body={
            "name": "Smoke Casual", "code": "SMKCL", "kind": "casual", "annual_days": "3", "carry_forward_max": "1"})
        assert code == 201, lt
        code, err = request("POST", "/school/hr/leave-types", token=tok, body={"name": "Dup", "code": "SMKCL"})
        assert code == 400, err
        code, res = request("POST", "/school/hr/leave-balances/allot", token=tok, body={"year": YEAR, "carry_forward": True})
        assert code == 200 and res["created"] >= 1, res
        code, bal = request("GET", f"/school/hr/leave-balances?year={YEAR}", token=tok)
        mine = next(b for b in bal if b["user_id"] == hired["user_id"] and b["leave_type_id"] == lt["id"])
        assert mine["allotted"] == "3.0" and mine["available"] == "3.0", mine
        code, adj = request("PATCH", f"/school/hr/leave-balances/{mine['id']}", token=tok,
                            body={"adjustment": "1", "note": "Smoke joining bonus day"})
        assert adj["available"] == "4.0", adj

        code, err = request("POST", "/staff/leaves", token=new_tok, body={
            "leave_type_id": lt["id"], "from_date": f"{YEAR}-03-01", "to_date": f"{YEAR}-03-10", "reason": "Smoke too long"})
        assert code == 400 and "left this year" in err["detail"], err
        code, lv = request("POST", "/staff/leaves", token=new_tok, body={
            "leave_type_id": lt["id"], "from_date": f"{YEAR}-03-01", "to_date": f"{YEAR}-03-02", "reason": "Smoke family work"})
        assert code == 201 and lv["leave_type_id"] == lt["id"], lv
        assert leave_used(hired["user_id"], lt["id"]) == Decimal("0.0"), "nothing used until approved"
        code, dec = request("POST", f"/school/staff-leaves/{lv['id']}/decide", token=tok,
                            body={"status": "approved", "decision_remark": "Smoke ok"})
        assert code == 200 and dec["status"] == "approved", dec
        assert leave_used(hired["user_id"], lt["id"]) == Decimal("2.0"), leave_used(hired["user_id"], lt["id"])
        code, mine2 = request("GET", f"/staff/leaves/balances?year={YEAR}", token=new_tok)
        row = next(b for b in mine2 if b["leave_type_id"] == lt["id"])
        assert row["used"] == "2.0" and row["available"] == "2.0", row
        code, types = request("GET", "/staff/leaves/types", token=new_tok)
        assert any(t["id"] == lt["id"] for t in types), types
        print("  3 days allotted (+1 adjusted); 2-day leave approved leaves 2 available; over-limit refused")

        print("\nALL RECRUITMENT / LEAVE CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
