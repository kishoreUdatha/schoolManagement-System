"""End-to-end smoke test for discipline incidents and counselling cases.

Verifies:
    Discipline: any staff member can report (the office is told); the reporter
      can correct it only until the office takes it up; actions are office-only;
      a suspension notifies parents; parents see only shared incidents and never
      the witness notes; summary counts repeat offenders.
    Counselling: cases are private — an unrelated teacher can't see them, the
      referring teacher can see their own but not a sensitive one, and only the
      counsellor or office can add notes; closing needs an outcome; telling
      parents sends a message, never the notes.

Run:
    docker exec sms-backend python -m scripts.smoketest_pastoral
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import timedelta

from sqlalchemy import func, select

from app.core.enums import UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.pastoral import CounsellingCase, CounsellingSession, DisciplineAction, DisciplineIncident
from app.models.student import Student
from app.models.user import User

from scripts import devdata


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
OTHER = ("smoke.pas.other@dev.local", "OtherPass123!")
COUNSELLOR = ("smoke.pas.counsellor@dev.local", "CounsellorPass123!")
PARENT_PW = "ParentPass123!"
MARK = "Smoke pastoral"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
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
        extra = {}
        for email, pw, name in ((OTHER[0], OTHER[1], "Smoke Pas Other"), (COUNSELLOR[0], COUNSELLOR[1], "Smoke Pas Counsellor")):
            u = User(tenant_id=admin.tenant_id, school_id=admin.school_id, full_name=name, email=email,
                     password_hash=hash_password(pw), role=UserRole.teacher, is_active=True)
            db.add(u)
            extra[email] = u
        student, parent_id = db.execute(
            select(Student, ParentStudent.parent_user_id)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True)).limit(1)
        ).first()
        parent = db.get(User, parent_id)
        parent.password_hash = hash_password(PARENT_PW)
        sec = db.get(Section, student.section_id)
        saved_ct = sec.class_teacher_user_id
        sec.class_teacher_user_id = teacher.id
        db.commit()
        return dict(sid=student.id, section_id=sec.id, parent_email=parent.email, parent_id=parent_id,
                    teacher_id=teacher.id, counsellor_id=extra[COUNSELLOR[0]].id, other_id=extra[OTHER[0]].id,
                    saved_ct=saved_ct)
    finally:
        db.close()


def cleanup(ctx=None):
    db = SessionLocal()
    try:
        inc = select(DisciplineIncident.id).where(DisciplineIncident.description.like("Smoke%"))
        db.execute(DisciplineAction.__table__.delete().where(DisciplineAction.incident_id.in_(inc)))
        cases = select(CounsellingCase.id).where(CounsellingCase.concern.like("Smoke%") | CounsellingCase.title.like("%Smoke%"))
        db.execute(CounsellingSession.__table__.delete().where(CounsellingSession.case_id.in_(cases)))
        db.execute(DisciplineAction.__table__.delete().where(DisciplineAction.counselling_case_id.in_(cases)))
        db.execute(CounsellingCase.__table__.delete().where(CounsellingCase.id.in_(cases)))
        db.execute(DisciplineIncident.__table__.delete().where(DisciplineIncident.description.like("Smoke%")))
        db.execute(Notice.__table__.delete().where(Notice.body.like("Smoke%") | Notice.title.like("%School incident%")
                                                   | Notice.title.like("%Action recorded%") | Notice.title.like("%counsellor%")
                                                   | Notice.title.like("%Discipline:%") | Notice.title.like("%Counselling case%")))
        db.execute(User.__table__.delete().where(User.email.in_((OTHER[0], COUNSELLOR[0]))))
        if ctx:
            db.get(Section, ctx["section_id"]).class_teacher_user_id = ctx["saved_ct"]
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


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    cleanup()
    ctx = setup()
    sid = ctx["sid"]
    today = devdata.today()  # the school's date, which is what the API writes
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        otok = login("teacher", *OTHER)
        ctok = login("teacher", *COUNSELLOR)
        ptok = login("parent", ctx["parent_email"], PARENT_PW)

        section("Reporting an incident")
        before = notices_for(ctx["parent_id"], "%School incident%")
        code, err = request("POST", "/school/discipline/incidents", token=ttok, body={
            "student_id": sid, "occurred_on": str(today + timedelta(days=2)), "description": "Smoke future"})
        assert code == 400, err
        code, inc = request("POST", "/school/discipline/incidents", token=ttok, body={
            "student_id": sid, "occurred_on": str(today), "place": "Corridor", "category": "fighting",
            "severity": "medium", "description": "Smoke pushed another student", "witnesses": "Smoke witness A"})
        assert code == 201 and inc["reference_no"].startswith("DIS-") and inc["status"] == "reported", inc
        assert not inc["shared_with_parents"] and notices_for(ctx["parent_id"], "%School incident%") == before
        code, mine = request("GET", "/school/discipline/incidents", token=ttok)
        assert any(x["id"] == inc["id"] for x in mine), "reporter sees it"
        code, theirs = request("GET", "/school/discipline/incidents", token=otok)
        assert not any(x["id"] == inc["id"] for x in theirs), "an unrelated teacher does not"
        code, err = request("POST", f"/school/discipline/incidents/{inc['id']}/actions", token=ttok, body={"kind": "detention"})
        assert code == 403, err
        print(f"  {inc['reference_no']} reported by the class teacher; office notified; actions are office-only")

        section("Office handling")
        code, upd = request("PATCH", f"/school/discipline/incidents/{inc['id']}", token=tok, body={"status": "investigating"})
        assert upd["status"] == "investigating", upd
        code, err = request("PATCH", f"/school/discipline/incidents/{inc['id']}", token=ttok, body={"description": "Smoke edited"})
        assert code == 403, "reporter can't edit once the office started"
        before = notices_for(ctx["parent_id"], "%Action recorded%")
        code, withact = request("POST", f"/school/discipline/incidents/{inc['id']}/actions", token=tok, body={
            "kind": "suspension", "details": "Two days", "start_date": str(today), "end_date": str(today + timedelta(days=1)),
            "notify_parents": True})
        assert code == 201 and withact["actions"][0]["kind"] == "suspension" and withact["status"] == "action_taken", withact
        assert notices_for(ctx["parent_id"], "%Action recorded%") == before + 1
        assert withact["shared_with_parents"], "notifying shares it"
        code, err = request("POST", f"/school/discipline/incidents/{inc['id']}/actions", token=tok, body={
            "kind": "detention", "start_date": str(today + timedelta(days=3)), "end_date": str(today)})
        assert code == 400, err
        code, closed = request("PATCH", f"/school/discipline/incidents/{inc['id']}", token=tok, body={
            "status": "closed", "resolution": "Smoke apology given"})
        assert closed["closed_on"] == str(today) and closed["closed_by_name"], closed
        code, err = request("DELETE", f"/school/discipline/incidents/{inc['id']}", token=tok)
        assert code == 400, "actions must go first"
        print("  investigate -> suspension (parents told) -> closed with a resolution")

        section("Parent view")
        code, seen = request("GET", f"/parent/me/children/{sid}/discipline", token=ptok)
        row = next(x for x in seen if x["id"] == inc["id"])
        assert row["actions"][0]["kind"] == "suspension" and not row.get("witnesses"), row
        code, hidden = request("POST", "/school/discipline/incidents", token=tok, body={
            "student_id": sid, "occurred_on": str(today), "category": "uniform", "severity": "low",
            "description": "Smoke unshared minor note"})
        code, seen = request("GET", f"/parent/me/children/{sid}/discipline", token=ptok)
        assert not any(x["id"] == hidden["id"] for x in seen), "unshared incidents stay internal"
        code, shared = request("POST", f"/school/discipline/incidents/{hidden['id']}/share", token=tok,
                               body={"message": "Smoke please speak with your child"})
        assert shared["shared_with_parents"], shared
        code, seen = request("GET", f"/parent/me/children/{sid}/discipline", token=ptok)
        assert any(x["id"] == hidden["id"] for x in seen), seen
        code, summ = request("GET", "/school/discipline/incidents/summary", token=tok)
        assert summ["total"] >= 2 and summ["by_category"]["fighting"] >= 1, summ
        assert any(r["student_id"] == sid and r["incidents"] >= 2 for r in summ["repeat_students"]), summ["repeat_students"]
        code, err = request("GET", "/school/discipline/incidents/summary", token=ttok)
        assert code == 403, err
        print("  parents see shared incidents only; summary flags the repeat student")

        section("Counselling privacy")
        code, case = request("POST", "/school/discipline/counselling/cases", token=ttok, body={
            "student_id": sid, "title": "Smoke settling in", "category": "emotional",
            "concern": "Smoke withdrawn in class", "priority": "high", "counsellor_user_id": ctx["counsellor_id"]})
        assert code == 201 and case["reference_no"].startswith("CNS-"), case
        assert notices_for(ctx["counsellor_id"], "%Counselling case%") == 1, "counsellor told"
        code, theirs = request("GET", "/school/discipline/counselling/cases", token=otok)
        assert not any(x["id"] == case["id"] for x in theirs), "unrelated teacher sees nothing"
        code, refs = request("GET", "/school/discipline/counselling/cases", token=ttok)
        assert any(x["id"] == case["id"] for x in refs), "referrer sees their own"
        code, err = request("POST", f"/school/discipline/counselling/cases/{case['id']}/sessions", token=ttok,
                            body={"met_on": str(today), "notes": "Smoke nope"})
        assert code == 403, "referrer can't write notes"
        code, s = request("POST", f"/school/discipline/counselling/cases/{case['id']}/sessions", token=ctok,
                          body={"met_on": str(today), "minutes": 30, "notes": "Smoke first session", "next_session_on": str(today + timedelta(days=7))})
        assert code == 201, s
        code, d = request("GET", f"/school/discipline/counselling/cases/{case['id']}", token=ctok)
        assert d["status"] == "in_progress" and d["session_count"] == 1 and d["sessions"][0]["notes"] == "Smoke first session", d
        code, sens = request("PATCH", f"/school/discipline/counselling/cases/{case['id']}", token=ctok, body={"is_sensitive": True})
        assert sens["is_sensitive"], sens
        code, refs = request("GET", "/school/discipline/counselling/cases", token=ttok)
        assert not any(x["id"] == case["id"] for x in refs), "sensitive cases hide from the referrer"
        code, all_ = request("GET", "/school/discipline/counselling/cases", token=tok)
        assert any(x["id"] == case["id"] for x in all_), "office still sees it"
        before = notices_for(ctx["parent_id"], "%counsellor%")
        code, inf = request("POST", f"/school/discipline/counselling/cases/{case['id']}/inform-parents", token=ctok,
                            body={"message": "Smoke we would like to meet you next week"})
        assert code == 200 and inf["parent_informed"] and notices_for(ctx["parent_id"], "%counsellor%") == before + 1
        code, err = request("PATCH", f"/school/discipline/counselling/cases/{case['id']}", token=ctok, body={"status": "closed"})
        assert code == 400, "closing needs an outcome"
        code, done = request("PATCH", f"/school/discipline/counselling/cases/{case['id']}", token=ctok,
                             body={"status": "closed", "outcome": "Smoke settled, will review next term"})
        assert done["status"] == "closed" and done["closed_on"] == str(today), done
        code, err = request("POST", f"/school/discipline/counselling/cases/{case['id']}/sessions", token=ctok,
                            body={"met_on": str(today), "notes": "Smoke after close"})
        assert code == 400, err
        print("  private by default, sensitive hides from the referrer, parents get a message not the notes")

        section("Referral from an action")
        code, i2 = request("POST", "/school/discipline/incidents", token=tok, body={
            "student_id": sid, "occurred_on": str(today), "category": "bullying", "severity": "high",
            "description": "Smoke repeated teasing"})
        code, withref = request("POST", f"/school/discipline/incidents/{i2['id']}/actions", token=tok, body={
            "kind": "counselling_referral", "details": "Smoke refer to counsellor"})
        case_id = withref["actions"][0]["counselling_case_id"]
        assert case_id, withref
        code, c2 = request("GET", f"/school/discipline/counselling/cases/{case_id}", token=tok)
        assert c2["category"] == "behaviour" and c2["title"].startswith("Referral from incident"), c2
        print("  a counselling referral action opens the case automatically")

        print("\nALL DISCIPLINE / COUNSELLING CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
