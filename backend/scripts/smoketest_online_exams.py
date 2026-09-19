"""End-to-end smoke test for the question bank and online tests.

Verifies:
    Bank: per-kind validation, true/false options filled in, subject teachers
      only, Bloom counts, used questions protected.
    Tests: window vs duration, auto-pick by Bloom level (and refusal when the
      bank is short), publish notifies parents, questions locked once published.
    Sitting (parent portal): paper hides answers, invalid options rejected,
      negative marking, short answers wait for the teacher, one attempt only,
      deadline auto-submit, result visibility on_submit vs after_close.
    Results: per-question and per-Bloom stats; teacher grades short answers.

Run:
    docker exec sms-backend python -m scripts.smoketest_online_exams
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.enums import SubjectKind, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import SchoolClass, Section
from app.models.notice import Notice, NoticeRecipient
from app.models.online_exam import OnlineTest, Question, TestAttempt
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
OTHER = ("smoke.oe.other@dev.local", "OtherPass123!")
PARENT_PW = "ParentPass123!"
CODE = "SMKOE"


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
        db.add(User(tenant_id=admin.tenant_id, school_id=admin.school_id, full_name="Smoke OE Other",
                    email=OTHER[0], password_hash=hash_password(OTHER[1]), role=UserRole.teacher, is_active=True))
        student, parent = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        sec = db.get(Section, student.section_id)
        subj = Subject(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke OE Maths", code=CODE, kind=SubjectKind.core)
        db.add(subj)
        db.flush()
        cs = ClassSubject(tenant_id=admin.tenant_id, school_id=admin.school_id, class_id=sec.class_id, subject_id=subj.id,
                          teacher_user_id=teacher.id)
        db.add(cs)
        db.commit()
        return dict(sid=student.id, section_id=sec.id, cs=cs.id, subject=subj.id, parent_email=parent.email, parent_id=parent.id,
                    class_name=db.get(SchoolClass, sec.class_id).name)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        subj_ids = select(Subject.id).where(Subject.code == CODE)
        cs_ids = select(ClassSubject.id).where(ClassSubject.subject_id.in_(subj_ids))
        db.execute(OnlineTest.__table__.delete().where(OnlineTest.class_subject_id.in_(cs_ids)))
        db.execute(Question.__table__.delete().where(Question.subject_id.in_(subj_ids)))
        db.execute(ClassSubject.__table__.delete().where(ClassSubject.subject_id.in_(subj_ids)))
        db.execute(Subject.__table__.delete().where(Subject.code == CODE))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Smoke OE%")))
        db.execute(User.__table__.delete().where(User.email == OTHER[0]))
        db.commit()
    finally:
        db.close()


def notices_for(user_id):
    db = SessionLocal()
    try:
        return db.execute(
            select(func.count()).select_from(NoticeRecipient).join(Notice, NoticeRecipient.notice_id == Notice.id)
            .where(NoticeRecipient.user_id == user_id, Notice.title.like("%Smoke OE%"))
        ).scalar_one()
    finally:
        db.close()


def expire_attempt(attempt_id):
    db = SessionLocal()
    try:
        a = db.get(TestAttempt, attempt_id)
        a.deadline_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def q(subject, kind, text, bloom, **kw):
    return {"subject_id": subject, "kind": kind, "text": text, "bloom_level": bloom, "difficulty": kw.pop("difficulty", "easy"), **kw}


def main():
    cleanup()
    ctx = setup()
    sid, subj = ctx["sid"], ctx["subject"]
    now = datetime.now(timezone.utc)
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        otok = login("teacher", *OTHER)
        ptok = login("parent", ctx["parent_email"], PARENT_PW)

        section("Question bank")
        opts = [{"key": "A", "text": "3"}, {"key": "B", "text": "4"}, {"key": "C", "text": "5"}]
        code, err = request("POST", "/school/questions", token=ttok,
                            body=q(subj, "single", "2+2?", "remember", options=opts, answer={"keys": ["A", "B"]}))
        assert code == 422, err
        code, err = request("POST", "/school/questions", token=ttok, body=q(subj, "numeric", "pi?", "apply", answer={}))
        assert code == 422, err
        code, err = request("POST", "/school/questions", token=otok,
                            body=q(subj, "single", "2+2?", "remember", options=opts, answer={"keys": ["B"]}))
        assert code == 403, err
        ids = {}
        code, r = request("POST", "/school/questions", token=ttok,
                          body=q(subj, "single", "2+2?", "remember", options=opts, answer={"keys": ["B"]}, marks="2", class_level=ctx["class_name"]))
        assert code == 201 and r["options"][1]["text"] == "4", r
        ids["single"] = r["id"]
        code, r = request("POST", "/school/questions", token=ttok,
                          body=q(subj, "true_false", "Zero is even", "understand", answer={"keys": ["T"]}))
        assert code == 201 and [o["key"] for o in r["options"]] == ["T", "F"], r
        ids["tf"] = r["id"]
        code, r = request("POST", "/school/questions", token=ttok,
                          body=q(subj, "multiple", "Primes?", "apply", options=opts, answer={"keys": ["A", "C"]}, difficulty="medium"))
        ids["multi"] = r["id"]
        code, r = request("POST", "/school/questions", token=ttok,
                          body=q(subj, "numeric", "Half of 7?", "apply", answer={"value": 3.5, "tolerance": 0.01}))
        ids["num"] = r["id"]
        code, r = request("POST", "/school/questions", token=ttok,
                          body=q(subj, "short", "Explain place value", "analyze", marks="3", answer={"model_answer": "Digit worth depends on position"}))
        ids["short"] = r["id"]
        for i in range(3):
            request("POST", "/school/questions", token=ttok,
                    body=q(subj, "single", f"Spare {i}", "remember", options=opts, answer={"keys": ["A"]}))
        code, page = request("GET", f"/school/questions?subject_id={subj}", token=ttok)
        assert page["total"] == 8 and page["by_bloom"] == {"remember": 4, "understand": 1, "apply": 2, "analyze": 1}, page
        code, page = request("GET", f"/school/questions?subject_id={subj}&bloom_level=apply", token=otok)
        assert page["total"] == 0, "other teacher sees none of this subject"
        print("  8 questions across 4 Bloom levels; validation + subject scope enforced")

        section("Test setup")
        base_test = {"class_subject_id": ctx["cs"], "title": "Smoke OE unit test", "duration_minutes": 20,
                     "starts_at": (now - timedelta(minutes=1)).isoformat(), "ends_at": (now + timedelta(minutes=60)).isoformat(),
                     "negative_marking": "0.5", "result_visibility": "on_submit", "shuffle_questions": True}
        code, err = request("POST", "/school/online-tests", token=ttok,
                            body={**base_test, "ends_at": (now + timedelta(minutes=10)).isoformat()})
        assert code == 422, err
        code, t = request("POST", "/school/online-tests", token=ttok, body=base_test)
        assert code == 201 and t["status"] == "draft" and t["can_edit"], t
        tid = t["id"]
        code, err = request("POST", f"/school/online-tests/{tid}/auto-pick", token=ttok,
                            body={"rules": [{"bloom_level": "create", "count": 1}]})
        assert code == 400 and "bank has 0" in err["detail"], err
        code, t = request("POST", f"/school/online-tests/{tid}/questions", token=ttok,
                          body={"question_ids": [ids["single"], ids["tf"], ids["multi"], ids["num"], ids["short"]]})
        assert t["question_count"] == 5 and t["total_marks"] == "8.00", t
        assert t["by_bloom"] == {"remember": "2.00", "understand": "1.00", "apply": "2.00", "analyze": "3.00"}, t["by_bloom"]
        code, err = request("POST", f"/school/online-tests/{tid}/publish", token=otok)
        assert code in (403, 404), err
        before = notices_for(ctx["parent_id"])
        code, t = request("POST", f"/school/online-tests/{tid}/publish", token=ttok)
        assert code == 200 and t["status"] == "published" and t["is_open"], t
        assert notices_for(ctx["parent_id"]) == before + 1, "parents notified"
        code, err = request("POST", f"/school/online-tests/{tid}/questions", token=ttok, body={"question_ids": [ids["single"]]})
        assert code == 400, err
        code, err = request("PUT", f"/school/questions/{ids['single']}", token=ttok,
                            body=q(subj, "single", "2+2?", "remember", options=opts, answer={"keys": ["C"]}))
        assert code == 400, err
        code, err = request("DELETE", f"/school/questions/{ids['single']}", token=ttok)
        assert code == 400, err
        print("  window check, auto-pick shortage, publish + notice, paper locked")

        section("Sitting the test")
        code, lst = request("GET", f"/parent/me/children/{sid}/tests", token=ptok)
        mine = next(x for x in lst if x["id"] == tid)
        assert mine["state"] == "open" and mine["question_count"] == 5, mine
        code, paper = request("POST", f"/parent/me/children/{sid}/tests/{tid}/start", token=ptok)
        assert code == 200 and len(paper["questions"]) == 5 and paper["seconds_left"] > 1100, paper
        assert all("correct" not in x and "answer" not in x for x in paper["questions"]), "answers hidden"
        aid = paper["attempt_id"]
        code, again = request("POST", f"/parent/me/children/{sid}/tests/{tid}/start", token=ptok)
        assert again["attempt_id"] == aid, "resume, not a second attempt"
        code, err = request("PUT", f"/parent/me/test-attempts/{aid}/answers", token=ptok,
                            body={"answers": {str(ids["single"]): {"keys": ["Z"]}}})
        assert code == 400, err
        code, err = request("PUT", f"/parent/me/test-attempts/{aid}/answers", token=ptok,
                            body={"answers": {str(ids["tf"]): {"keys": ["T", "F"]}}})
        assert code == 400, err
        code, paper = request("PUT", f"/parent/me/test-attempts/{aid}/answers", token=ptok, body={"answers": {
            str(ids["single"]): {"keys": ["B"]},      # +2
            str(ids["tf"]): {"keys": ["F"]},          # wrong: -0.5
            str(ids["multi"]): {"keys": ["C", "A"]},  # +1
            str(ids["num"]): {"value": "3.5"},        # +1
            str(ids["short"]): {"text": "The position of a digit sets its value"},
        }})
        assert code == 200 and next(x for x in paper["questions"] if x["question_id"] == ids["num"])["response"] == {"value": 3.5}, paper
        code, res = request("POST", f"/parent/me/test-attempts/{aid}/submit", token=ptok)
        assert code == 200 and res["visible"] and res["status"] == "submitted" and res["pending_grading"] == 1, res
        assert res["score"] == "3.50" and res["max_score"] == "8.00", res
        code, err = request("POST", f"/parent/me/children/{sid}/tests/{tid}/start", token=ptok)
        assert code == 400, err
        print(f"  auto-marked {res['score']}/{res['max_score']} with -0.5 negative marking; short answer pending")

        section("Teacher results + grading")
        code, rs = request("GET", f"/school/online-tests/{tid}/results", token=ttok)
        assert rs["attempted"] == 1 and rs["rows"][0]["pending_grading"] == 1 if len(rs["rows"]) == 1 else rs["attempted"] == 1, rs
        tf = next(x for x in rs["questions"] if x["question_id"] == ids["tf"])
        assert tf["correct"] == 0 and tf["percent_correct"] == 0, tf
        rem = next(b for b in rs["blooms"] if b["bloom_level"] == "remember")
        assert rem["avg_percent"] == 100, rs["blooms"]
        code, err = request("PUT", f"/school/test-attempts/{aid}/answers/{ids['short']}/grade", token=ttok, body={"marks": "4"})
        assert code == 400, err
        code, r = request("PUT", f"/school/test-attempts/{aid}/answers/{ids['short']}/grade", token=ttok,
                          body={"marks": "2", "comment": "Good, add an example"})
        assert code == 200 and r["status"] == "graded" and r["score"] == "5.50" and r["pending_grading"] == 0, r
        code, res = request("GET", f"/parent/me/test-attempts/{aid}/result", token=ptok)
        short = next(x for x in res["questions"] if x["question_id"] == ids["short"])
        assert res["score"] == "5.50" and short["teacher_comment"] == "Good, add an example", res
        code, err = request("PUT", f"/school/online-tests/{tid}", token=ttok, body=base_test)
        assert code == 400, err
        code, err = request("DELETE", f"/school/online-tests/{tid}", token=ttok)
        assert code == 400, err
        print("  stats by question and Bloom level; short answer graded -> 5.50")

        section("Timing + visibility")
        code, t2 = request("POST", "/school/online-tests", token=ttok,
                           body={**base_test, "title": "Smoke OE quiz 2", "result_visibility": "after_close", "negative_marking": "0"})
        t2id = t2["id"]
        code, _r = request("POST", f"/school/online-tests/{t2id}/auto-pick", token=ttok,
                           body={"rules": [{"bloom_level": "remember", "count": 2}]})
        assert code == 200 and _r["question_count"] == 2, _r
        request("POST", f"/school/online-tests/{t2id}/publish", token=ttok)
        code, p2 = request("POST", f"/parent/me/children/{sid}/tests/{t2id}/start", token=ptok)
        a2 = p2["attempt_id"]
        expire_attempt(a2)
        code, err = request("GET", f"/parent/me/test-attempts/{a2}", token=ptok)
        assert code == 400, err
        code, res = request("GET", f"/parent/me/test-attempts/{a2}/result", token=ptok)
        assert res["auto_submitted"] and not res["visible"] and "score" not in res or res["score"] is None, res
        code, t2 = request("POST", f"/school/online-tests/{t2id}/close", token=ttok)
        assert t2["status"] == "closed", t2
        code, res = request("GET", f"/parent/me/test-attempts/{a2}/result", token=ptok)
        assert res["visible"] and res["score"] == "0.00", res
        code, lst = request("GET", f"/parent/me/children/{sid}/tests", token=ptok)
        assert next(x for x in lst if x["id"] == t2id)["state"] == "done", lst
        print("  expired attempt auto-submitted; result hidden until the test closed")

        print("\nALL ONLINE EXAM CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
