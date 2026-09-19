"""End-to-end smoke test for timetable cover and student leave.

Verifies:
    Cover: a teacher on approved leave makes their slots appear on the cover
      board; candidates are ranked free > unavailable > teaching; assigning a
      busy teacher needs force; auto-assign fills the rest; the substitute is
      notified and sees their cover; extra absent teachers can be added.
    Student leave: parent applies (overlaps refused), rejecting needs a note,
      approval notifies the parent, the attendance register shows the leave and
      marking the child absent sends no absence alert; cancel rules.

Run:
    docker exec sms-backend python -m scripts.smoketest_cover
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, time, timedelta

from sqlalchemy import func, select

from app.core.enums import StaffLeaveKind, StaffLeaveStatus, SubjectKind, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.attendance import StudentAttendance
from app.models.cover import StudentLeave, Substitution, TeacherUnavailability
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.staff_leave import StaffLeave
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PW = "CoverPass123!"
PARENT_PW = "ParentPass123!"
T = {k: f"smoke.cov.{k}@dev.local" for k in "abcd"}
PNUMS = (17, 18)


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


def setup(d: date):
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        tid, sid_ = admin.tenant_id, admin.school_id
        users = {}
        for k, email in T.items():
            u = User(tenant_id=tid, school_id=sid_, full_name=f"Smoke Cov {k.upper()}", email=email,
                     password_hash=hash_password(PW), role=UserRole.teacher, is_active=True)
            db.add(u)
            users[k] = u
        student, parent = db.execute(
            select(Student, User).join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == sid_, Student.is_active.is_(True)).limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        sec_x = db.get(Section, student.section_id)
        sec_y = Section(tenant_id=tid, school_id=sid_, class_id=sec_x.class_id, name="SMKZ", capacity=10)
        db.add(sec_y)
        s1 = Subject(tenant_id=tid, school_id=sid_, name="Smoke Cover One", code="SMKCOV1", kind=SubjectKind.core)
        s2 = Subject(tenant_id=tid, school_id=sid_, name="Smoke Cover Two", code="SMKCOV2", kind=SubjectKind.core)
        db.add_all([s1, s2])
        db.flush()
        cs_a = ClassSubject(tenant_id=tid, school_id=sid_, class_id=sec_x.class_id, subject_id=s1.id, teacher_user_id=users["a"].id)
        cs_c = ClassSubject(tenant_id=tid, school_id=sid_, class_id=sec_x.class_id, subject_id=s2.id, teacher_user_id=users["c"].id)
        db.add_all([cs_a, cs_c])
        dow = d.isoweekday()
        p17 = Period(tenant_id=tid, school_id=sid_, day_of_week=dow, period_number=PNUMS[0], start_time=time(15, 0), end_time=time(15, 40))
        p18 = Period(tenant_id=tid, school_id=sid_, day_of_week=dow, period_number=PNUMS[1], start_time=time(15, 45), end_time=time(16, 25))
        db.add_all([p17, p18])
        db.flush()
        e1 = TimetableEntry(tenant_id=tid, school_id=sid_, section_id=sec_x.id, period_id=p17.id, class_subject_id=cs_a.id)
        e2 = TimetableEntry(tenant_id=tid, school_id=sid_, section_id=sec_y.id, period_id=p17.id, class_subject_id=cs_c.id)
        e3 = TimetableEntry(tenant_id=tid, school_id=sid_, section_id=sec_x.id, period_id=p18.id, class_subject_id=cs_a.id)
        db.add_all([e1, e2, e3])
        db.add(StaffLeave(tenant_id=tid, school_id=sid_, applicant_user_id=users["a"].id, kind=StaffLeaveKind.sick,
                          from_date=d, to_date=d, reason="Smoke cover", status=StaffLeaveStatus.approved))
        db.add(TeacherUnavailability(tenant_id=tid, school_id=sid_, user_id=users["d"].id, day_of_week=dow,
                                     period_number=PNUMS[0], reason="Exam duty"))
        saved_ct = sec_x.class_teacher_user_id
        sec_x.class_teacher_user_id = teacher.id
        today = date.today()
        prior = db.execute(
            select(StudentAttendance).where(StudentAttendance.student_id == student.id, StudentAttendance.date == today)
        ).scalar_one_or_none()
        db.commit()
        return dict(
            users={k: u.id for k, u in users.items()}, e1=e1.id, e2=e2.id, e3=e3.id, sec_x=sec_x.id, sec_y=sec_y.id,
            sid=student.id, parent_email=parent.email, parent_id=parent.id, teacher_id=teacher.id, saved_ct=saved_ct,
            prior=(prior.status, prior.remark) if prior else None,
        )
    finally:
        db.close()


def cleanup(ctx=None):
    db = SessionLocal()
    try:
        uids = select(User.id).where(User.email.in_(T.values()))
        db.execute(StaffLeave.__table__.delete().where(StaffLeave.applicant_user_id.in_(uids)))
        subj = select(Subject.id).where(Subject.code.in_(("SMKCOV1", "SMKCOV2")))
        cs = select(ClassSubject.id).where(ClassSubject.subject_id.in_(subj))
        db.execute(TimetableEntry.__table__.delete().where(TimetableEntry.class_subject_id.in_(cs)))
        db.execute(Period.__table__.delete().where(Period.period_number.in_(PNUMS)))
        db.execute(ClassSubject.__table__.delete().where(ClassSubject.subject_id.in_(subj)))
        db.execute(Subject.__table__.delete().where(Subject.code.in_(("SMKCOV1", "SMKCOV2"))))
        db.execute(Section.__table__.delete().where(Section.name == "SMKZ"))
        db.execute(TeacherUnavailability.__table__.delete().where(TeacherUnavailability.user_id.in_(uids)))
        db.execute(User.__table__.delete().where(User.email.in_(T.values())))
        db.execute(StudentLeave.__table__.delete().where(StudentLeave.reason.like("Smoke%")))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Smoke Cov%") | Notice.body.like("%Smoke%")))
        if ctx:
            sec = db.get(Section, ctx["sec_x"])
            sec.class_teacher_user_id = ctx["saved_ct"]
            today = date.today()
            row = db.execute(
                select(StudentAttendance).where(StudentAttendance.student_id == ctx["sid"], StudentAttendance.date == today)
            ).scalar_one_or_none()
            if ctx["prior"] is None and row:
                db.delete(row)
            elif ctx["prior"] and row:
                row.status, row.remark = ctx["prior"]
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
    d = date.today() + timedelta(days=7)
    ctx = setup(d)
    U = ctx["users"]
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        btok = login("teacher", T["b"], PW)
        ptok = login("parent", ctx["parent_email"], PARENT_PW)

        section("Cover board")
        code, day = request("GET", f"/school/cover/day?date={d}", token=tok)
        a = next(x for x in day["absent"] if x["user_id"] == U["a"])
        mine = [s for s in day["slots"] if s["absent_user_id"] == U["a"]]
        assert a["reason"] == "leave" and a["periods"] == 2 and len(mine) == 2 and all(not s["substitute_user_id"] for s in mine), day
        code, err = request("GET", f"/school/cover/day?date={d}", token=btok)
        assert code == 403, err
        code, cands = request("GET", f"/school/cover/candidates?date={d}&entry_id={ctx['e1']}", token=tok)
        st = {c["user_id"]: c["status"] for c in cands}
        assert U["a"] not in st and st[U["b"]] == "free" and st[U["c"]] == "busy_teaching" and st[U["d"]] == "unavailable", st
        order = [c["user_id"] for c in cands]
        assert order.index(U["b"]) < order.index(U["d"]) < order.index(U["c"]), order
        print("  2 slots need cover; B free, D unavailable (exam duty), C teaching")

        section("Assigning")
        code, err = request("POST", "/school/cover/assign", token=tok,
                            body={"sub_date": str(d), "timetable_entry_id": ctx["e1"], "substitute_user_id": U["c"]})
        assert code == 409 and "busy teaching" in err["detail"], err
        code, err = request("POST", "/school/cover/assign", token=tok,
                            body={"sub_date": str(d), "timetable_entry_id": ctx["e1"], "substitute_user_id": U["a"]})
        assert code == 400, err
        before = notices_for(U["b"], "Cover:%")
        code, _r = request("POST", "/school/cover/assign", token=tok,
                           body={"sub_date": str(d), "timetable_entry_id": ctx["e1"], "substitute_user_id": U["b"], "note": "Revise ch 3"})
        assert code == 204, _r
        assert notices_for(U["b"], "Cover:%") == before + 1, "substitute notified"
        code, cands = request("GET", f"/school/cover/candidates?date={d}&entry_id={ctx['e3']}", token=tok)
        b = next(c for c in cands if c["user_id"] == U["b"])
        assert b["status"] == "free" and b["covers_this_week"] == 1, b
        code, r = request("POST", "/school/cover/auto-assign", token=tok, body={"date": str(d)})
        assert r["assigned"] == 1, r
        code, day = request("GET", f"/school/cover/day?date={d}", token=tok)
        assert day["uncovered"] == 0 and day["covered"] == 2, day
        auto = next(s for s in day["slots"] if s["timetable_entry_id"] == ctx["e3"])
        assert auto["substitute_user_id"] in (U["d"], U["c"]) or auto["substitute_user_id"] not in (U["a"], U["b"]), auto
        code, mine = request("GET", f"/school/cover/mine?start={d}&end={d}", token=btok)
        assert len(mine) == 1 and mine[0]["note"] == "Revise ch 3" and mine[0]["period_number"] == PNUMS[0], mine
        code, day2 = request("GET", f"/school/cover/day?date={d}&absent={U['c']}", token=tok)
        c_slot = next(s for s in day2["slots"] if s["timetable_entry_id"] == ctx["e2"])
        assert c_slot["reason"] == "marked_absent" and not c_slot["substitute_user_id"], c_slot
        sub_id = next(s for s in day["slots"] if s["timetable_entry_id"] == ctx["e1"])["substitution_id"]
        before = notices_for(U["b"], "Cover cancelled%")
        code, _ = request("DELETE", f"/school/cover/{sub_id}", token=tok)
        assert code == 204 and notices_for(U["b"], "Cover cancelled%") == before + 1
        code, stats = request("GET", f"/school/cover/stats?start={d}&end={d}", token=tok)
        assert sum(s["covers"] for s in stats) == 1, stats
        print("  busy teacher needs force, auto-assign filled the rest, notices sent, cover list + stats")

        section("Unavailability")
        code, blocks = request("POST", "/school/cover/unavailability", token=tok,
                               body={"user_id": U["b"], "day_of_week": d.isoweekday(), "reason": "Coordinator day"})
        assert code == 201 and any(x["user_id"] == U["b"] and x["period_number"] is None for x in blocks), blocks
        code, err = request("POST", "/school/cover/unavailability", token=tok,
                            body={"user_id": U["b"], "day_of_week": d.isoweekday(), "reason": "dup"})
        assert code == 400, err
        code, cands = request("GET", f"/school/cover/candidates?date={d}&entry_id={ctx['e1']}", token=tok)
        assert next(c for c in cands if c["user_id"] == U["b"])["status"] == "unavailable", cands
        print("  whole-day block makes B unavailable")

        section("Student leave")
        today = date.today()
        body = {"kind": "sick", "from_date": str(today - timedelta(days=1)), "to_date": str(today + timedelta(days=1)), "reason": "Smoke fever"}
        before = notices_for(ctx["teacher_id"], "Leave request:%")
        code, lv = request("POST", f"/parent/me/children/{ctx['sid']}/leaves", token=ptok, body=body)
        assert code == 201 and lv["status"] == "pending" and lv["days"] == 3, lv
        assert notices_for(ctx["teacher_id"], "Leave request:%") == before + 1, "class teacher notified"
        code, err = request("POST", f"/parent/me/children/{ctx['sid']}/leaves", token=ptok, body=body)
        assert code == 400, err
        code, err = request("POST", f"/parent/me/children/{ctx['sid']}/leaves", token=ptok,
                            body={**body, "to_date": str(today - timedelta(days=5))})
        assert code == 422, err
        code, queue = request("GET", "/school/student-leaves?status=pending", token=ttok)
        row = next(x for x in queue if x["id"] == lv["id"])
        assert row["can_decide"], row
        code, err = request("POST", f"/school/student-leaves/{lv['id']}/decide", token=btok, body={"approve": True})
        assert code == 403, err
        code, err = request("POST", f"/school/student-leaves/{lv['id']}/decide", token=ttok, body={"approve": False})
        assert code == 400, err
        before = notices_for(ctx["parent_id"], "Leave approved%")
        code, lv2 = request("POST", f"/school/student-leaves/{lv['id']}/decide", token=ttok, body={"approve": True, "note": "Get well soon"})
        assert code == 200 and lv2["status"] == "approved" and lv2["decided_by_name"], lv2
        assert notices_for(ctx["parent_id"], "Leave approved%") == before + 1

        code, att = request("GET", f"/teacher/attendance?section_id={ctx['sec_x']}&date={today}", token=ttok)
        r = next(x for x in att["rows"] if x["student_id"] == ctx["sid"])
        assert r["on_leave"] == "Sick leave", r
        code, res = request("POST", "/teacher/attendance/save", token=ttok, body={
            "section_id": ctx["sec_x"], "date": str(today), "entries": [{"student_id": ctx["sid"], "status": "absent"}]})
        assert code == 200 and res["absence_alerts_sent"] == 0, res
        code, att = request("GET", f"/teacher/attendance?section_id={ctx['sec_x']}&date={today}", token=ttok)
        r = next(x for x in att["rows"] if x["student_id"] == ctx["sid"])
        assert r["status"] == "absent" and r["remark"] == "Sick leave", r
        code, err = request("POST", f"/parent/me/children/{ctx['sid']}/leaves/{lv['id']}/cancel", token=ptok)
        assert code == 400, err
        code, lv3 = request("POST", f"/parent/me/children/{ctx['sid']}/leaves", token=ptok, body={
            "kind": "family", "from_date": str(today + timedelta(days=10)), "to_date": str(today + timedelta(days=11)), "reason": "Smoke wedding"})
        code, c = request("POST", f"/parent/me/children/{ctx['sid']}/leaves/{lv3['id']}/cancel", token=ptok)
        assert code == 200 and c["status"] == "cancelled", c
        code, mine = request("GET", f"/parent/me/children/{ctx['sid']}/leaves", token=ptok)
        assert {x["status"] for x in mine if x["reason"].startswith("Smoke")} == {"approved", "cancelled"}, mine
        print("  apply -> teacher notified -> approve -> register shows 'Sick leave', no absence alert")

        print("\nALL COVER / STUDENT LEAVE CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
