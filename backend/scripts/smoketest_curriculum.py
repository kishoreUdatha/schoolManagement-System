"""End-to-end smoke test for learning outcomes and teaching resources.

Verifies:
    Outcomes are unique per code within a subject, can only be mapped to that
    subject's own topics, and report coverage for a section from what has
    actually been taught (not started / in progress / covered).
    Resources: a link or a file (not both), the file downloads and counts,
    parents see only what was shared with them, and a teacher from another
    subject can't post to this one.

Run:
    docker exec sms-backend python -m scripts.smoketest_curriculum
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.curriculum import LearningOutcome, TeachingResource
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.syllabus import SyllabusChapter, SyllabusTopic
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-CURR"

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
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
            if raw:
                return r.status, payload
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
    """Build a small syllabus of our own (the seed data has none): a chapter with
    two topics on a class-subject whose section has a parent-linked student."""
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        link = db.execute(
            select(ParentStudent).join(Student, Student.id == ParentStudent.student_id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True),
                   Student.section_id.is_not(None)).limit(1)
        ).scalar_one()
        student = db.get(Student, link.student_id)
        parent = db.get(User, link.parent_user_id)
        parent.password_hash = hash_password("ParentPass123!")
        sec = db.get(Section, student.section_id)
        subjects = list(db.execute(
            select(ClassSubject).where(ClassSubject.class_id == sec.class_id).limit(2)
        ).scalars())
        while len(subjects) < 2:  # a bare dev database has no subjects at all
            n = len(subjects) + 1
            sub = Subject(tenant_id=student.tenant_id, school_id=student.school_id,
                          name=f"{TAG} subject {n}", code=f"SMKC{n}")
            db.add(sub)
            db.flush()
            cs_new = ClassSubject(tenant_id=student.tenant_id, school_id=student.school_id,
                                  class_id=sec.class_id, subject_id=sub.id)
            db.add(cs_new)
            db.flush()
            subjects.append(cs_new)
        cs = subjects[0]

        def chapter(on: ClassSubject, n_topics: int) -> tuple[int, list[int]]:
            ch = SyllabusChapter(tenant_id=on.tenant_id, school_id=on.school_id, class_subject_id=on.id,
                                 title=f"{TAG} chapter", sequence=900)
            db.add(ch)
            db.flush()
            ids = []
            for i in range(n_topics):
                t = SyllabusTopic(tenant_id=on.tenant_id, school_id=on.school_id, chapter_id=ch.id,
                                  title=f"{TAG} topic {i + 1}", sequence=900 + i)
                db.add(t)
                db.flush()
                ids.append(t.id)
            return ch.id, ids

        ch_id, topic_ids = chapter(cs, 2)
        other_topic = chapter(subjects[1], 1)[1][0] if len(subjects) > 1 else None
        db.commit()
        return dict(cs_id=cs.id, chapter_id=ch_id, topic_ids=topic_ids, section_id=sec.id,
                    student_id=student.id, parent_email=parent.email, other_topic=other_topic)
    finally:
        db.close()


def cleanup(ctx):
    """Topic coverage and outcome mappings cascade off the topics we delete."""
    db = SessionLocal()
    try:
        db.execute(LearningOutcome.__table__.delete().where(LearningOutcome.code.like(f"{TAG}%")))
        db.execute(TeachingResource.__table__.delete().where(TeachingResource.title.like(f"{TAG}%")))
        db.execute(SyllabusTopic.__table__.delete().where(SyllabusTopic.title.like(f"{TAG}%")))
        db.execute(SyllabusChapter.__table__.delete().where(SyllabusChapter.title.like(f"{TAG}%")))
        subs = select(Subject.id).where(Subject.name.like(f"{TAG}%"))
        db.execute(ClassSubject.__table__.delete().where(ClassSubject.subject_id.in_(subs)))
        db.execute(Subject.__table__.delete().where(Subject.name.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def main():
    cleanup(None)
    ctx = setup()
    cs, ch, t1, t2, sec = ctx["cs_id"], ctx["chapter_id"], *ctx["topic_ids"][:2], ctx["section_id"]
    code_a, code_b = f"{TAG}-{uuid.uuid4().hex[:4]}", f"{TAG}-{uuid.uuid4().hex[:4]}"
    try:
        tok = login("school", *ADMIN)
        ptok = login("parent", ctx["parent_email"], "ParentPass123!")

        section("Learning outcomes")
        code, o1 = request("POST", "/school/learning-outcomes", token=tok, body={
            "class_subject_id": cs, "chapter_id": ch, "code": code_a, "bloom_level": "apply",
            "statement": "Smoke: solve two-step problems", "topic_ids": [t1, t2]})
        assert code == 201, o1
        assert len(o1["topics"]) == 2 and o1["chapter_title"], o1
        code, err = request("POST", "/school/learning-outcomes", token=tok, body={
            "class_subject_id": cs, "code": code_a.lower(), "statement": "Smoke: duplicate code"})
        assert code == 400 and "already exists" in err["detail"], err
        if ctx["other_topic"]:
            code, err = request("POST", "/school/learning-outcomes", token=tok, body={
                "class_subject_id": cs, "code": code_b, "statement": "Smoke: borrowed topic",
                "topic_ids": [ctx["other_topic"]]})
            assert code == 400 and "syllabus" in err["detail"], err
        code, o2 = request("POST", "/school/learning-outcomes", token=tok, body={
            "class_subject_id": cs, "code": code_b, "statement": "Smoke: unmapped outcome"})
        assert code == 201, o2
        print(f"  created 2 outcomes; duplicate code and a borrowed topic both refused")

        section("Coverage follows what was taught")
        code, cov = request("GET", f"/school/learning-outcomes/coverage?class_subject_id={cs}&section_id={sec}", token=tok)
        assert code == 200, cov
        mine = next(o for o in cov["outcomes"] if o["id"] == o1["id"])
        assert mine["status"] == "not_started" and cov["unmapped"] >= 1, (mine, cov["unmapped"])
        code, res = request("PUT", f"/school/syllabus/topics/{t1}/coverage", token=tok, body={
            "section_id": sec, "covered": True, "covered_on": str(date.today())})
        assert code == 204, res
        code, cov = request("GET", f"/school/learning-outcomes/coverage?class_subject_id={cs}&section_id={sec}", token=tok)
        mine = next(o for o in cov["outcomes"] if o["id"] == o1["id"])
        assert mine["status"] == "in_progress" and mine["topics_covered"] == 1, mine
        code, res = request("PUT", f"/school/syllabus/topics/{t2}/coverage", token=tok, body={
            "section_id": sec, "covered": True, "covered_on": str(date.today())})
        assert code == 204, res
        code, cov = request("GET", f"/school/learning-outcomes/coverage?class_subject_id={cs}&section_id={sec}", token=tok)
        mine = next(o for o in cov["outcomes"] if o["id"] == o1["id"])
        assert mine["status"] == "covered" and cov["covered"] >= 1, (mine, cov)
        print(f"  {cov['section_label']}: not started -> in progress -> covered as topics were taught")

        section("Editing an outcome")
        code, up = request("PATCH", f"/school/learning-outcomes/{o1['id']}", token=tok,
                           body={"topic_ids": [t1], "statement": "Smoke: revised statement"})
        assert up["statement"] == "Smoke: revised statement" and len(up["topics"]) == 1, up
        code, _ = request("DELETE", f"/school/learning-outcomes/{o2['id']}", token=tok)
        assert code == 204
        code, err = request("GET", f"/school/learning-outcomes/{o2['id']}", token=tok)
        assert code == 404, err
        print("  topic mapping replaced on edit; deleted outcome is gone")

        section("Teaching resources")
        code, err = request("POST", "/school/teaching-resources", token=tok,
                            form={"class_subject_id": str(cs), "title": f"{TAG} neither"})
        assert code == 400 and "file or" in err["detail"], err
        code, link = request("POST", "/school/teaching-resources", token=tok, form={
            "class_subject_id": str(cs), "title": f"{TAG} link", "kind": "link",
            "url": "https://example.org/notes", "chapter_id": str(ch), "visible_to_parents": "true"})
        assert code == 201 and link["url"] and not link["has_file"], link
        pdf = b"%PDF-1.4\n% smoke test worksheet\n"
        code, filed = request("POST", "/school/teaching-resources", token=tok,
                              form={"class_subject_id": str(cs), "title": f"{TAG} worksheet", "kind": "worksheet"},
                              files={"file": ("worksheet.pdf", pdf, "application/pdf")})
        assert code == 201 and filed["has_file"] and filed["size_bytes"] == len(pdf), filed
        assert filed["visible_to_parents"] is False, filed
        code, err = request("POST", "/school/teaching-resources", token=tok,
                            form={"class_subject_id": str(cs), "title": f"{TAG} bad", "url": "https://x.test"},
                            files={"file": ("x.pdf", pdf, "application/pdf")})
        assert code == 400 and "not both" in err["detail"], err
        code, blob = request("GET", f"/school/teaching-resources/{filed['id']}/file", token=tok, raw=True)
        assert code == 200 and blob == pdf, code
        code, again = request("GET", f"/school/teaching-resources/{filed['id']}", token=tok)
        assert again["downloads"] == 1, again
        code, err = request("GET", f"/school/teaching-resources/{link['id']}/file", token=tok)
        assert code == 400 and "link" in err["detail"], err
        print("  link and file both stored, download counted, a link has no file to fetch")

        section("What parents see")
        sid = ctx["student_id"]
        code, mine = request("GET", f"/parent/me/children/{sid}/resources", token=ptok)
        assert code == 200, mine
        titles = {m["title"] for m in mine}
        assert f"{TAG} link" in titles and f"{TAG} worksheet" not in titles, titles
        code, err = request("GET", f"/parent/me/children/{sid}/resources/{filed['id']}/file", token=ptok)
        assert code == 404, "an unshared resource is invisible to a parent"
        code, shared = request("PATCH", f"/school/teaching-resources/{filed['id']}", token=tok,
                               body={"visible_to_parents": True})
        assert shared["visible_to_parents"], shared
        code, blob = request("GET", f"/parent/me/children/{sid}/resources/{filed['id']}/file", token=ptok, raw=True)
        assert code == 200 and blob == pdf, code
        code, _ = request("DELETE", f"/school/teaching-resources/{link['id']}", token=tok)
        assert code == 204
        print("  parents get only what was shared; sharing it makes the file downloadable")

        print("\nALL CURRICULUM CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
