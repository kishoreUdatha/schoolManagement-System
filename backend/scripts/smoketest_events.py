"""End-to-end smoke test for events, parent-teacher meetings, gallery, calendar.

Verifies:
    Events: audience validation; drafts hidden from parents; publishing notifies
      the class parents; consent yes/no (latest wins) and the admin's report;
      published events can only be cancelled, not deleted.
    PTM: slots generated from the window; only teachers can take slots; parents
      book one slot per teacher per child, taken slots are refused; timing can't
      change once slots exist; teacher can't record an outcome before the day;
      notes reach the parent; booked teachers/sessions can't be removed.
    Gallery: only photos can be uploaded; empty albums can't be published;
      parents and staff can load photos of published albums only.
    Calendar feeds for staff and parents.

Run:
    docker exec sms-backend python -m scripts.smoketest_events
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta

from sqlalchemy import func, select

from app.core import storage
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.events import GalleryAlbum, GalleryPhoto, PtmSession, SchoolEvent
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PARENT_PW = "ParentPass123!"
MARK = "Smoke Ev"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.4\n%%EOF\n"


def request(method, path, *, token=None, body=None, files=None):
    headers = {}
    if files is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for k, fname, content in files:
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
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            if not r.headers.get("content-type", "").startswith("application/json"):
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


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        student, parent, class_id = db.execute(
            select(Student, User, Section.class_id)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .join(Section, Student.section_id == Section.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        other_section = db.execute(
            select(Section.id).where(Section.school_id == admin.school_id, Section.id != student.section_id).limit(1)
        ).scalar_one_or_none()
        db.commit()
        return dict(sid=student.id, section_id=student.section_id, class_id=class_id, parent_email=parent.email,
                    parent_id=parent.id, teacher_id=teacher.id, other_section=other_section)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        keys = list(db.execute(
            select(GalleryPhoto.file_key).join(GalleryAlbum, GalleryPhoto.album_id == GalleryAlbum.id)
            .where(GalleryAlbum.title.like(f"{MARK}%"))
        ).scalars())
        db.execute(GalleryAlbum.__table__.delete().where(GalleryAlbum.title.like(f"{MARK}%")))
        db.execute(PtmSession.__table__.delete().where(PtmSession.title.like(f"{MARK}%")))
        db.execute(SchoolEvent.__table__.delete().where(SchoolEvent.title.like(f"{MARK}%")))
        db.execute(Notice.__table__.delete().where(Notice.title.like(f"%{MARK}%")))
        db.commit()
        for k in keys:
            storage.delete(k)
    finally:
        db.close()


def notices_for(user_id: int) -> int:
    db = SessionLocal()
    try:
        return db.execute(
            select(func.count()).select_from(NoticeRecipient).join(Notice, NoticeRecipient.notice_id == Notice.id)
            .where(NoticeRecipient.user_id == user_id, Notice.title.like(f"%{MARK}%"))
        ).scalar_one()
    finally:
        db.close()


def set_meeting_date(session_id: int, d: date):
    db = SessionLocal()
    try:
        db.get(PtmSession, session_id).meeting_date = d
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    ctx = setup()
    cleanup()
    sid = ctx["sid"]
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        ptok = login("parent", ctx["parent_email"], PARENT_PW)
        soon = date.today() + timedelta(days=5)

        section("Events: validation")
        code, err = request("POST", "/school/events", token=tok,
                            body={"title": f"{MARK} bad", "start_date": soon.isoformat(), "audience": "class_parents"})
        assert code == 400, err
        code, err = request("POST", "/school/events", token=tok,
                            body={"title": f"{MARK} bad", "start_date": soon.isoformat(), "audience": "staff",
                                  "requires_consent": True})
        assert code == 400, err
        code, err = request("POST", "/school/events", token=tok,
                            body={"title": f"{MARK} bad", "start_date": soon.isoformat(),
                                  "end_date": (soon - timedelta(days=1)).isoformat()})
        assert code == 422, err
        print("  missing class, staff consent and reversed dates rejected")

        section("Events: publish + consent")
        code, trip = request("POST", "/school/events", token=tok, body={
            "title": f"{MARK} zoo trip", "kind": "trip", "start_date": soon.isoformat(),
            "start_time": "09:00", "end_time": "14:00", "venue": "City zoo",
            "audience": "class_parents", "class_id": ctx["class_id"], "requires_consent": True,
            "consent_deadline": (soon - timedelta(days=1)).isoformat(), "fee_amount": "250",
        })
        assert code == 201 and trip["audience_label"].endswith("parents") and not trip["is_published"], trip
        code, pe = request("GET", "/parent/me/events", token=ptok)
        assert not any(e["id"] == trip["id"] for e in pe), "draft hidden from parents"
        before = notices_for(ctx["parent_id"])
        code, trip = request("POST", f"/school/events/{trip['id']}/publish", token=tok)
        assert code == 200 and trip["is_published"], trip
        assert notices_for(ctx["parent_id"]) == before + 1, "parent notified on publish"
        code, pe = request("GET", "/parent/me/events", token=ptok)
        mine = next(e for e in pe if e["id"] == trip["id"])
        assert mine["consent_open"] and any(c["student_id"] == sid and c["response"] is None for c in mine["children"]), mine
        code, r = request("POST", f"/parent/me/events/{trip['id']}/consent", token=ptok,
                          body={"student_id": sid, "response": "yes"})
        assert code == 200, r
        code, r = request("POST", f"/parent/me/events/{trip['id']}/consent", token=ptok,
                          body={"student_id": sid, "response": "no", "note": "Unwell"})
        # find the child by id rather than by position — a parent with more
        # than one child in the class gets them back in no guaranteed order
        assert code == 200, r
        mine = next(c for c in r[0]["children"] if c["student_id"] == sid)
        assert mine["response"] == "no", r
        code, rep = request("GET", f"/school/events/{trip['id']}/consents", token=tok)
        assert code == 200 and rep["no"] == 1 and rep["yes"] == 0 and rep["pending"] == rep["eligible"] - 1, rep
        row = next(x for x in rep["rows"] if x["student_id"] == sid)
        assert row["note"] == "Unwell" and row["parent_name"], row
        print(f"  consent report: {rep['eligible']} eligible, {rep['no']} declined")

        if ctx["other_section"]:
            code, other = request("POST", "/school/events", token=tok, body={
                "title": f"{MARK} other section", "start_date": soon.isoformat(),
                "audience": "section_parents", "section_id": ctx["other_section"], "requires_consent": True,
            })
            request("POST", f"/school/events/{other['id']}/publish", token=tok)
            code, pe = request("GET", "/parent/me/events", token=ptok)
            assert not any(e["id"] == other["id"] for e in pe), "other section's event hidden"
            code, err = request("POST", f"/parent/me/events/{other['id']}/consent", token=ptok,
                                body={"student_id": sid, "response": "yes"})
            assert code == 404, err
            print("  another section's event is invisible and can't be answered")

        code, err = request("DELETE", f"/school/events/{trip['id']}", token=tok)
        assert code == 400, err
        code, draft = request("POST", "/school/events", token=tok,
                              body={"title": f"{MARK} staff meeting", "start_date": soon.isoformat(), "audience": "staff"})
        code, _ = request("DELETE", f"/school/events/{draft['id']}", token=tok)
        assert code == 204
        code, c = request("POST", f"/school/events/{trip['id']}/cancel", token=tok)
        assert code == 200 and c["is_cancelled"], c
        code, err = request("POST", f"/parent/me/events/{trip['id']}/consent", token=ptok,
                            body={"student_id": sid, "response": "yes"})
        assert code == 400, err
        print("  published event cancelled (not deleted); consent closed")

        section("Parent-teacher meetings")
        code, s = request("POST", "/school/ptm", token=tok, body={
            "title": f"{MARK} PTM", "meeting_date": soon.isoformat(), "start_time": "10:00",
            "end_time": "11:00", "slot_minutes": 15, "venue": "Hall",
        })
        assert code == 201 and s["scope_label"] == "Whole school", s
        code, err = request("POST", f"/school/ptm/{s['id']}/publish", token=tok)
        assert code == 400, "no teachers yet"
        code, err = request("POST", f"/school/ptm/{s['id']}/teachers", token=tok, body={"user_ids": [ctx["parent_id"]]})
        assert code == 400, err
        code, d = request("POST", f"/school/ptm/{s['id']}/teachers", token=tok, body={"user_ids": [ctx["teacher_id"]]})
        assert code == 200 and len(d["teachers"]) == 1 and len(d["teachers"][0]["slots"]) == 4, d
        code, err = request("PUT", f"/school/ptm/{s['id']}", token=tok, body={
            "title": f"{MARK} PTM", "meeting_date": soon.isoformat(), "start_time": "10:00",
            "end_time": "12:00", "slot_minutes": 15,
        })
        assert code == 400, err
        code, d = request("POST", f"/school/ptm/{s['id']}/publish", token=tok)
        assert code == 200 and d["is_published"], d
        code, ps = request("GET", "/parent/me/ptm", token=ptok)
        mine = next(x for x in ps if x["id"] == s["id"])
        assert mine["booking_open"] and sid in mine["eligible_children"], mine
        slots = mine["teachers"][0]["slots"]
        code, ps = request("POST", "/parent/me/ptm/book", token=ptok,
                           body={"slot_id": slots[1]["id"], "student_id": sid, "note": "Maths progress"})
        assert code == 200, ps
        code, err = request("POST", "/parent/me/ptm/book", token=ptok, body={"slot_id": slots[2]["id"], "student_id": sid})
        assert code == 400, err
        code, err = request("POST", "/parent/me/ptm/book", token=ptok, body={"slot_id": slots[1]["id"], "student_id": sid})
        assert code == 409, err
        print("  booked 10:15; second slot with same teacher and taken slot refused")

        code, tm = request("GET", "/teacher/ptm", token=ttok)
        tsess = next(x for x in tm if x["id"] == s["id"])
        booked = next(x for x in tsess["slots"] if x["student_id"] == sid)
        assert booked["parent_note"] == "Maths progress" and booked["class_label"], booked
        code, err = request("PUT", f"/teacher/ptm/slots/{booked['id']}", token=ttok,
                            body={"status": "done", "teacher_notes": "Doing well"})
        assert code == 400, "meeting hasn't happened"

        code, ps = request("DELETE", f"/parent/me/ptm/slots/{booked['id']}", token=ptok)
        assert code == 200 and all(x["state"] == "open" for x in ps[[p["id"] for p in ps].index(s["id"])]["teachers"][0]["slots"]), ps
        code, ps = request("POST", "/parent/me/ptm/book", token=ptok, body={"slot_id": slots[0]["id"], "student_id": sid})
        assert code == 200
        before = notices_for(ctx["parent_id"])
        code, d = request("DELETE", f"/school/ptm/{s['id']}/slots/{slots[0]['id']}/booking", token=tok)
        assert code == 200 and notices_for(ctx["parent_id"]) == before + 1, "parent told about admin cancel"
        code, ps = request("POST", "/parent/me/ptm/book", token=ptok, body={"slot_id": slots[3]["id"], "student_id": sid})
        assert code == 200
        code, err = request("DELETE", f"/school/ptm/{s['id']}/teachers/{ctx['teacher_id']}", token=tok)
        assert code == 400, err
        code, err = request("DELETE", f"/school/ptm/{s['id']}", token=tok)
        assert code == 400, err

        set_meeting_date(s["id"], date.today())
        code, r = request("PUT", f"/teacher/ptm/slots/{slots[3]['id']}", token=ttok,
                          body={"status": "done", "teacher_notes": "Doing well; read more at home"})
        assert code == 200 and r["status"] == "done", r
        code, ps = request("GET", "/parent/me/ptm", token=ptok)
        mine = next(x for x in ps if x["id"] == s["id"])
        got = next(x for x in mine["teachers"][0]["slots"] if x["id"] == slots[3]["id"])
        assert got["state"] == "mine" and got["teacher_notes"].startswith("Doing well"), got
        print("  cancel/rebook, admin cancel notice, teacher notes shared with parent")

        section("Gallery")
        code, a = request("POST", "/school/gallery", token=tok, body={
            "title": f"{MARK} sports day", "album_date": date.today().isoformat(), "audience": "parents",
        })
        assert code == 201, a
        code, err = request("POST", f"/school/gallery/{a['id']}/publish", token=tok)
        assert code == 400, "empty album"
        code, err = request("POST", f"/school/gallery/{a['id']}/photos", token=tok, files=[("files", "doc.pdf", PDF)])
        assert code == 400, err
        code, photos = request("POST", f"/school/gallery/{a['id']}/photos", token=tok,
                               files=[("files", "a.png", PNG), ("files", "b.png", PNG)])
        assert code == 201 and len(photos) == 2, photos
        code, pa = request("GET", "/parent/me/gallery", token=ptok)
        assert not any(x["id"] == a["id"] for x in pa), "draft album hidden"
        code, err = request("GET", f"/parent/me/gallery/photos/{photos[0]['id']}/file", token=ptok)
        assert code == 404
        code, a2 = request("POST", f"/school/gallery/{a['id']}/publish", token=tok)
        assert code == 200 and a2["photo_count"] == 2 and a2["cover_photo_id"] == photos[0]["id"], a2
        code, detail = request("GET", f"/parent/me/gallery/{a['id']}", token=ptok)
        assert code == 200 and len(detail["photos"]) == 2, detail
        code, raw = request("GET", f"/parent/me/gallery/photos/{photos[0]['id']}/file", token=ptok)
        assert code == 200 and raw == PNG
        code, raw = request("GET", f"/school/gallery/photos/{photos[1]['id']}/file", token=ttok)
        assert code == 200 and raw == PNG
        code, _ = request("DELETE", f"/school/gallery/photos/{photos[1]['id']}", token=tok)
        assert code == 204
        request("POST", f"/school/gallery/{a['id']}/publish?published=false", token=tok)
        code, err = request("GET", f"/parent/me/gallery/{a['id']}", token=ptok)
        assert code == 404, err
        print("  photos only, publish gating, parent + teacher access")

        section("Calendar")
        rng = f"?start={date.today().isoformat()}&end={(soon + timedelta(days=2)).isoformat()}"
        code, cal = request("GET", f"/school/calendar{rng}", token=ttok)
        assert code == 200 and any(i["type"] == "ptm" and i["id"] == s["id"] for i in cal), cal
        assert any(i["type"] == "ptm_slot" for i in cal), "teacher sees own booked meeting"
        code, cal = request("GET", f"/parent/me/calendar{rng}", token=ptok)
        assert code == 200 and any(i["type"] == "event" and i["id"] == trip["id"] and i["is_cancelled"] for i in cal), cal
        assert any(i["type"] == "ptm_slot" for i in cal), cal
        print(f"  parent calendar: {len(cal)} items")

        print("\nALL EVENTS / PTM / GALLERY CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
