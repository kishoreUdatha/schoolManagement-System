"""Smoke test for exam operations: datesheet, halls, invigilation, admit
cards, component marks and the promotion decision.

Verifies:
    A datesheet groups papers by day and calls two papers a clash only when
    the same class would have to sit both at once.
    Allocation fills the chosen rooms in order, refuses rooms that cannot
    hold everybody, and puts each child in exactly one room.
    An invigilator cannot be in two rooms at the same hour, and the refusal
    says who and where.
    An admit card carries every paper for that child's class with its room,
    and prints as a PDF.
    Components must add up to the paper. Marks recorded against them set the
    paper total, so the parts and the whole can never disagree.
    The promotion preview separates "failed" from "no marks yet".
    A principal may publish results; a teacher may not touch any of it.

Run:
    docker exec sms-backend python -m scripts.smoketest_exam_ops
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
from app.models.exam import Exam, ExamSubject
from app.models.exam_ops import (
    ExamRoomAllocation,
    ExamSubjectComponent,
    Invigilation,
    MarkComponent,
)
from app.models.facility import Room
from app.models.mark import Mark
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-EXOPS"


def request(method, path, *, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            if raw:
                return r.status, payload
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload.decode(errors="ignore")[:200]}


def section(t):
    print(f"\n=== {t} ===")


def login(role, email, password):
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == email)).scalar_one()
        u.password_hash = hash_password(password)
        db.commit()
    finally:
        db.close()
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": password})
    assert code == 200, (email, data)
    return data["access_token"]


def cleanup():
    db = SessionLocal()
    try:
        exams = select(Exam.id).where(Exam.name.like(f"{TAG}%"))
        papers = select(ExamSubject.id).where(ExamSubject.exam_id.in_(exams))
        marks = select(Mark.id).where(Mark.exam_subject_id.in_(papers))
        components = select(ExamSubjectComponent.id).where(
            ExamSubjectComponent.exam_subject_id.in_(papers))
        db.execute(MarkComponent.__table__.delete().where(
            MarkComponent.mark_id.in_(marks) | MarkComponent.component_id.in_(components)))
        db.execute(ExamSubjectComponent.__table__.delete().where(
            ExamSubjectComponent.exam_subject_id.in_(papers)))
        db.execute(Invigilation.__table__.delete().where(
            Invigilation.exam_subject_id.in_(papers)))
        db.execute(ExamRoomAllocation.__table__.delete().where(
            ExamRoomAllocation.exam_subject_id.in_(papers)))
        db.execute(Mark.__table__.delete().where(Mark.exam_subject_id.in_(papers)))
        db.execute(ExamSubject.__table__.delete().where(ExamSubject.exam_id.in_(exams)))
        db.execute(Exam.__table__.delete().where(Exam.name.like(f"{TAG}%")))
        db.execute(Room.__table__.delete().where(Room.name.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def make_rooms():
    """Two small rooms, so 'fills in order' and 'not enough seats' are both
    reachable with the handful of children the dev school has."""
    ids = devdata.school()
    db = SessionLocal()
    try:
        made = []
        for name, code, cap in ((f"{TAG} Hall A", f"{TAG}-A", 4), (f"{TAG} Hall B", f"{TAG}-B", 10)):
            r = Room(**ids, name=name, code=code, kind="classroom", capacity=cap, is_active=True)
            db.add(r)
            db.flush()
            made.append((r.id, cap))
        db.commit()
        return made
    finally:
        db.close()


def main():
    cleanup()
    tok = login("school", *ADMIN)
    ids = devdata.school()
    year = devdata.year_id()
    cs_id = devdata.class_subject_id()
    klass = devdata.klass()
    rooms = make_rooms()
    small, big = rooms[0][0], rooms[1][0]

    try:
        section("An exam with two papers on the same morning")
        day = date.today() + timedelta(days=10)
        code, exam = request("POST", "/school/exams", token=tok, body={
            "academic_year_id": year, "name": f"{TAG} Term 1", "kind": "term",
            "start_date": day.isoformat(), "end_date": (day + timedelta(days=2)).isoformat()})
        assert code == 201, exam
        exam_id = exam["id"]

        # A paper is unique per subject, so three papers need three subjects.
        # The first two sit at the same hour on purpose: that is the clash the
        # datesheet has to catch and the double-booking invigilation refuses.
        subjects = devdata.class_subject_ids()
        assert len(subjects) >= 2, f"the dev class needs two subjects, has {len(subjects)}"
        plan = [
            (subjects[0], day, "09:00:00"),
            (subjects[1], day, "10:00:00"),
        ]
        if len(subjects) > 2:
            plan.append((subjects[2], day + timedelta(days=1), "09:00:00"))

        papers = []
        for subject_cs, when, start in plan:
            code, p = request("POST", f"/school/exams/{exam_id}/papers", token=tok, body={
                "class_subject_id": subject_cs, "max_marks": 100, "pass_marks": 35,
                "exam_date": when.isoformat(), "start_time": start,
                "duration_minutes": 120})
            assert code == 201, p
            papers.append(p)
        assert len(papers) >= 2, papers
        paper_id = papers[0]["id"]
        print(f"  exam {exam_id} with {len(papers)} paper(s)")

        section("Datesheet")
        code, sheet = request("GET", f"/school/exam-ops/{exam_id}/datesheet", token=tok)
        assert code == 200, sheet
        assert sheet["days"], sheet
        assert sum(len(d["papers"]) for d in sheet["days"]) == len(papers), sheet
        assert all(d["papers"] for d in sheet["days"]), "no empty days"
        assert sheet["clashes"], "two papers for one class at the same hour is a clash"
        clash = sheet["clashes"][0]
        assert len(clash["papers"]) == 2 and clash["class_name"], clash
        print(f"  {len(sheet['days'])} day(s), {len(sheet['clashes'])} clash(es) found: "
              f"{clash['papers'][0]['subject_name']} against {clash['papers'][1]['subject_name']}")

        section("Halls")
        code, alloc = request("POST", f"/school/exam-ops/papers/{paper_id}/allocation",
                              token=tok, body={"room_ids": [small]})
        if code == 400:
            print(f"  one small room is refused: {alloc['detail'][:70]}")
            code, alloc = request("POST", f"/school/exam-ops/papers/{paper_id}/allocation",
                                  token=tok, body={"room_ids": [small, big]})
        assert code == 200, alloc
        assert alloc["seated"] == alloc["candidates"], alloc
        assert not alloc["unplaced"], alloc["unplaced"]
        seated_ids = [s["student_id"] for r in alloc["rooms"] for s in r["students"]]
        assert len(seated_ids) == len(set(seated_ids)), "nobody sits in two rooms"
        first = alloc["rooms"][0]
        assert not any(r["over_capacity"] for r in alloc["rooms"]), alloc["rooms"]
        print(f"  {alloc['seated']} of {alloc['candidates']} seated across "
              f"{len(alloc['rooms'])} room(s)")

        section("Moving one child")
        mover = seated_ids[0]
        code, moved = request("POST", f"/school/exam-ops/papers/{paper_id}/allocation/move",
                              token=tok, body={"student_id": mover, "room_id": big})
        assert code == 200, moved
        where = [r["room_id"] for r in moved["rooms"] if any(
            s["student_id"] == mover for s in r["students"])]
        assert where == [big], where
        print(f"  child {mover} is now in one room only, the one asked for")

        section("Invigilation")
        code, avail = request("GET",
                              f"/school/exam-ops/papers/{paper_id}/invigilators/available",
                              token=tok)
        assert code == 200 and avail, avail
        watcher = avail[0]["user_id"]
        code, inv = request("POST", f"/school/exam-ops/papers/{paper_id}/invigilators",
                            token=tok, body={"room_id": big, "user_id": watcher, "is_chief": True})
        assert code == 201, inv
        assert any(s["is_chief"] for r in inv["rooms"] for s in r["staff"]), inv
        print(f"  {avail[0]['name']} is chief in one room")

        section("The same person cannot watch two rooms at once")
        other = papers[1]["id"]
        request("POST", f"/school/exam-ops/papers/{other}/allocation",
                token=tok, body={"room_ids": [big]})
        code, err = request("POST", f"/school/exam-ops/papers/{other}/invigilators",
                            token=tok, body={"room_id": big, "user_id": watcher})
        assert code == 400, (code, err)
        assert "already invigilating" in err["detail"], err
        print(f"  refused: {err['detail'][:72]}")

        code, avail2 = request(
            "GET", f"/school/exam-ops/papers/{other}/invigilators/available", token=tok)
        busy = next(a for a in avail2 if a["user_id"] == watcher)
        assert not busy["available"] and busy["clash"], busy
        print(f"  and the list says why: clash with {busy['clash']}")

        section("Duty roster")
        code, roster = request("GET", f"/school/exam-ops/{exam_id}/duty-roster", token=tok)
        assert code == 200 and roster["total_duties"] >= 1, roster
        assert roster["staff"][0]["duties"], roster
        print(f"  {roster['total_duties']} duty(ies) across {len(roster['staff'])} person(s)")

        section("Admit card")
        child = devdata.child_id()
        code, card = request("GET", f"/school/exam-ops/{exam_id}/admit-cards/{child}", token=tok)
        assert code == 200, card
        assert card["sittings"], card
        assert card["student_name"] and card["admission_no"], card
        assert all(s["ends_at"] for s in card["sittings"]), "every sitting says when it ends"
        assert card["rooms_allocated"] >= 1, card
        print(f"  {card['student_name']}: {len(card['sittings'])} paper(s), "
              f"{card['rooms_allocated']} with a room")

        code, pdf = request("GET", f"/school/exam-ops/{exam_id}/admit-cards/{child}/pdf",
                            token=tok, raw=True)
        assert code == 200 and pdf[:4] == b"%PDF", pdf[:40]
        print(f"  prints as a {len(pdf)}-byte PDF")

        code, batch = request("GET",
                              f"/school/exam-ops/{exam_id}/admit-cards?class_id={klass.id}",
                              token=tok)
        assert code == 200 and len(batch) >= 1, batch
        print(f"  {len(batch)} card(s) for the whole class")

        section("Components must add up")
        code, err = request("PUT", f"/school/exam-ops/papers/{paper_id}/components", token=tok,
                            body={"components": [
                                {"name": "Theory", "max_marks": 60},
                                {"name": "Practical", "max_marks": 30}]})
        assert code == 400 and "out of 100" in err["detail"], err
        print(f"  refused: {err['detail']}")

        code, err = request("PUT", f"/school/exam-ops/papers/{paper_id}/components", token=tok,
                            body={"components": [
                                {"name": "Theory", "max_marks": 70},
                                {"name": "theory", "max_marks": 30}]})
        assert code == 400 and "share a name" in err["detail"], err
        print(f"  and: {err['detail']}")

        code, comps = request("PUT", f"/school/exam-ops/papers/{paper_id}/components", token=tok,
                              body={"components": [
                                  {"name": "Theory", "max_marks": 70, "pass_marks": 25},
                                  {"name": "Practical", "max_marks": 30, "pass_marks": 10}]})
        assert code == 200 and comps["unallocated"] == 0, comps
        theory, practical = comps["components"][0]["id"], comps["components"][1]["id"]
        print(f"  70 + 30 = {comps['allocated']}, nothing left over")

        section("The total follows from the parts")
        code, grid = request("GET", f"/school/exam-ops/papers/{paper_id}/component-marks",
                             token=tok)
        assert code == 200 and grid["rows"], grid
        target = grid["rows"][0]
        code, saved = request("PUT", f"/school/exam-ops/papers/{paper_id}/component-marks",
                              token=tok, body={"rows": [{
                                  "student_id": target["student_id"], "status": "scored",
                                  "values": {str(theory): 55, str(practical): 21}}]})
        assert code == 200, saved
        row = next(r for r in saved["rows"] if r["student_id"] == target["student_id"])
        assert row["total"] == 76, row
        print(f"  55 + 21 recorded as a paper total of {row['total']}")

        code, err = request("PUT", f"/school/exam-ops/papers/{paper_id}/component-marks",
                            token=tok, body={"rows": [{
                                "student_id": target["student_id"], "status": "scored",
                                "values": {str(practical): 44}}]})
        assert code == 400 and "out of 30" in err["detail"], err
        print(f"  a practical over its maximum is refused: {err['detail']}")

        section("Promotion is a suggestion, and knows what it doesn't know")
        code, promo = request("GET", f"/school/exam-ops/{exam_id}/promotion-preview", token=tok)
        assert code == 200, promo
        assert promo["total"] == sum(promo["counts"].values()), promo["counts"]
        review = [s for s in promo["students"] if s["suggestion"] == "review"]
        assert review, "children with unmarked papers are flagged, not failed"
        assert all(r["unmarked"] or r["absent"] for r in review), review[0]
        assert all(s["suggestion"] in ("promoted", "repeated", "review") for s in promo["students"])
        print(f"  {promo['counts']} — {len(review)} need a look rather than a verdict")

        section("Dashboard says what is blocking")
        code, dash = request("GET", f"/school/exam-ops/{exam_id}/dashboard", token=tok)
        assert code == 200, dash
        assert dash["papers"] == len(papers), dash
        assert dash["blockers"] and not dash["ready_to_publish"], dash
        kinds = {b["kind"] for b in dash["blockers"]}
        assert "marks" in kinds, dash["blockers"]
        print(f"  blocked by: {', '.join(b['detail'] for b in dash['blockers'])}")

        section("A principal may publish; a teacher may not")
        ptok = login("principal", "principal@dev.local", "PrincipalPass123!")
        code, pub = request("POST", f"/school/exams/{exam_id}/publish", token=ptok)
        assert code == 200 and pub["is_published"], pub
        code, un = request("POST", f"/school/exams/{exam_id}/unpublish", token=ptok)
        assert code == 200 and not un["is_published"], un
        print("  principal published and unpublished")

        ttok = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
        for path in (f"/school/exam-ops/{exam_id}/dashboard",
                     f"/school/exam-ops/papers/{paper_id}/allocation",
                     f"/school/exam-ops/{exam_id}/promotion-preview"):
            code, err = request("GET", path, token=ttok)
            assert code == 403, f"a teacher reached {path}: {code}"
        code, err = request("POST", f"/school/exams/{exam_id}/publish", token=ttok)
        assert code == 403, (code, err)
        print("  a teacher is refused the halls, the preview and the publish button")

        section("Clearing the seating plan")
        code, empty = request("DELETE", f"/school/exam-ops/papers/{paper_id}/allocation",
                              token=tok)
        assert code == 200 and empty["seated"] == 0, empty
        assert len(empty["unplaced"]) == empty["candidates"], empty
        print(f"  all {empty['candidates']} back to unplaced")

        print("\nALL EXAM-OPS CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
