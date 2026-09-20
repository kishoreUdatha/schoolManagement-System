"""Smoke test for the medication register, first aid, the counselling diary,
escalation chains and marking a sanction served.

Verifies:
    A counsellor's private notes are absent from the diary response entirely —
    not blanked, not filtered downstream, simply never selected — and the one
    route that returns them refuses anybody but their author.
    A dose record has no edit and no delete. A mistake is corrected by writing
    a second row that points at the first, and both stay readable.
    An escalation chain closes up when a link is removed, so nobody reading it
    stops at a gap.
    A vaccination drive records every child in the section, skipping only the
    ones named as absent, and does not double-record a child who already had
    that vaccine that day.
    A sanction can be marked served, says who signed it off, and cannot be
    signed off twice.

Run:
    docker exec sms-backend python -m scripts.smoketest_wellbeing
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
from app.models.health import Immunization
from app.models.pastoral import DisciplineAction, DisciplineIncident
from app.models.student import Student
from app.models.user import User
from app.models.wellbeing import (
    CounsellingAppointment,
    EmergencyEscalation,
    FirstAidLog,
    MedicationAdministration,
)
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-WELL"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
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
    code, data = request("POST", f"/{role}/auth/login",
                         body={"email": email, "password": password})
    assert code == 200, (email, data)
    return data["access_token"]


def cleanup():
    db = SessionLocal()
    try:
        db.execute(MedicationAdministration.__table__.delete().where(
            MedicationAdministration.medicine.like(f"{TAG}%")))
        db.execute(FirstAidLog.__table__.delete().where(
            FirstAidLog.what_happened.like(f"{TAG}%")))
        db.execute(CounsellingAppointment.__table__.delete().where(
            CounsellingAppointment.notes.like(f"{TAG}%")))
        db.execute(EmergencyEscalation.__table__.delete().where(
            EmergencyEscalation.contact_name.like(f"{TAG}%")))
        db.execute(Immunization.__table__.delete().where(
            Immunization.vaccine.like(f"{TAG}%")))
        incidents = select(DisciplineIncident.id).where(
            DisciplineIncident.description.like(f"{TAG}%"))
        db.execute(DisciplineAction.__table__.delete().where(
            DisciplineAction.incident_id.in_(incidents)))
        db.execute(DisciplineIncident.__table__.delete().where(
            DisciplineIncident.description.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    tok = login("school", *ADMIN)
    child = devdata.child_id()
    section_id = devdata.section_id("A")
    today = date.today()

    db = SessionLocal()
    try:
        in_section = db.execute(
            select(Student).where(Student.section_id == section_id,
                                  Student.is_active.is_(True))
        ).scalars().all()
        section_size = len(in_section)
        skip_me = in_section[0].id if in_section else None
        admin_id = db.execute(
            select(User.id).where(User.email == ADMIN[0])
        ).scalar_one()
    finally:
        db.close()
    assert section_size >= 2, "the seed puts several children in Grade 1 A"

    try:
        section("A dose is written once")
        code, dose = request("POST", "/school/wellbeing/medication", token=tok, body={
            "student_id": child, "given_on": str(today), "given_at": "11:15:00",
            "medicine": f"{TAG} Paracetamol", "dose": "250mg",
            "reason": "headache", "parent_informed": True})
        assert code == 201, dose
        assert dose["given_by"], "the register names who gave it"
        assert dose["is_superseded"] is False, dose
        first_id = dose["id"]
        print(f"  {dose['medicine']} {dose['dose']} to {dose['student_name']}, "
              f"given by {dose['given_by']}")

        section("There is no way to edit or delete it")
        for method in ("PATCH", "PUT", "DELETE"):
            code, _ = request(method, f"/school/wellbeing/medication/{first_id}", token=tok,
                              body={} if method != "DELETE" else None)
            assert code in (404, 405), (
                f"{method} on a dose record must not exist, got {code}")
        print("  PATCH, PUT and DELETE all refused — the register is append-only")

        section("A mistake is corrected by writing again")
        code, fixed = request(
            "POST", f"/school/wellbeing/medication/{first_id}/correct", token=tok, body={
                "given_on": str(today), "given_at": "11:15:00",
                "medicine": f"{TAG} Paracetamol", "dose": "125mg",
                "correction_reason": "dose written down wrong"})
        assert code == 201, fixed
        assert fixed["corrects_id"] == first_id, fixed
        assert fixed["dose"] == "125mg", fixed

        code, rows = request(
            f"GET", f"/school/wellbeing/medication?from={today}&to={today}", token=tok)
        assert code == 200, rows
        original = next(r for r in rows if r["id"] == first_id)
        assert original["is_superseded"] is True, (
            "the original stays readable, marked as superseded")
        assert original["dose"] == "250mg", "what was written at the time is preserved"
        print(f"  both rows survive: 250mg superseded, 125mg stands, "
              f"reason {fixed['correction_reason']!r}")

        code, again = request(
            "POST", f"/school/wellbeing/medication/{first_id}/correct", token=tok, body={
                "given_on": str(today), "given_at": "11:15:00",
                "medicine": f"{TAG} Paracetamol", "dose": "60mg",
                "correction_reason": "again"})
        assert again and "already been corrected" in str(again.get("detail", "")), again
        print("  and a superseded record cannot be corrected twice")

        section("First aid covers staff too")
        code, aid = request("POST", "/school/wellbeing/first-aid", token=tok, body={
            "staff_user_id": admin_id, "happened_on": str(today),
            "happened_at": "13:05:00", "place": "Corridor",
            "what_happened": f"{TAG} slipped on a wet floor",
            "treatment": "ice pack", "outcome": "returned_to_class"})
        assert code == 201, aid
        assert aid["student_id"] is None and aid["staff_name"], aid
        code, nobody = request("POST", "/school/wellbeing/first-aid", token=tok, body={
            "happened_on": str(today), "happened_at": "13:05:00",
            "what_happened": f"{TAG} nobody", "treatment": "none"})
        assert nobody and "who was hurt" in str(nobody.get("detail", "")), nobody
        print(f"  logged for {aid['staff_name']}; a log with nobody in it is refused")

        section("The diary never carries private notes")
        code, appt = request(
            "POST", "/school/wellbeing/counselling/appointments", token=tok, body={
                "student_id": child, "scheduled_on": str(today),
                "scheduled_at": "09:30:00", "notes": f"{TAG} first meeting"})
        assert code == 201, appt
        appt_id = appt["id"]
        assert "private_notes" not in appt, appt

        code, saved = request(
            "PATCH", f"/school/wellbeing/counselling/appointments/{appt_id}",
            token=tok, body={"status": "attended",
                             "private_notes": "SECRET-NOTEBOOK-STRING"})
        assert code == 200, saved

        code, diary = request(
            "GET", f"/school/wellbeing/counselling/appointments?from={today}&to={today}",
            token=tok)
        assert code == 200, diary
        blob = json.dumps(diary)
        assert "SECRET-NOTEBOOK-STRING" not in blob, (
            "the counsellor's notebook must never appear in the diary response")
        assert "private_notes" not in blob, (
            "not even the key — the list query does not select it")
        mine = next(a for a in diary if a["id"] == appt_id)
        assert mine["status"] == "attended" and mine["notes"], mine
        print("  status and shared notes come back; the private note does not, "
              "key included")

        section("The private note answers only to its author")
        code, own = request(
            "GET", f"/school/wellbeing/counselling/appointments/{appt_id}/private-note",
            token=tok)
        assert code == 200 and own["private_notes"] == "SECRET-NOTEBOOK-STRING", own

        ptok = login("principal", "principal@dev.local", "PrincipalPass123!")
        code, denied = request(
            "GET", f"/school/wellbeing/counselling/appointments/{appt_id}/private-note",
            token=ptok)
        assert code == 403, (
            f"a principal must not read another counsellor's note, got {code}")
        code, denied2 = request(
            "PATCH", f"/school/wellbeing/counselling/appointments/{appt_id}",
            token=ptok, body={"status": "attended", "private_notes": "overwrite"})
        assert denied2 and "counsellor who held" in str(denied2.get("detail", "")), denied2
        print(f"  the author reads it; the principal is refused both reading "
              f"and writing")

        section("A chain closes up when a link goes")
        made = []
        for n, who in enumerate(("Mother", "Father", "Aunt"), start=1):
            code, chain = request(
                "POST", f"/school/wellbeing/emergency/{child}", token=tok, body={
                    "contact_name": f"{TAG} {who}", "relationship": who,
                    "phone": f"99900011{n}"})
            assert code == 201, chain
            made = chain["chain"]
        assert [c["sequence"] for c in made] == [1, 2, 3], made

        middle = made[1]["id"]
        code, after = request(
            "DELETE", f"/school/wellbeing/emergency/contacts/{middle}", token=tok)
        assert code == 200, after
        seqs = [c["sequence"] for c in after["chain"]]
        assert seqs == [1, 2], f"the chain must renumber, got {seqs}"
        assert after["chain"][1]["contact_name"].endswith("Aunt"), after["chain"]
        print(f"  removed number 2; the aunt became 2 rather than leaving a hole")

        section("A drive records the room, minus the absentees")
        code, drive = request("POST", "/school/wellbeing/immunisation/bulk",
                              token=tok, body={
                                  "section_id": section_id,
                                  "vaccine": f"{TAG} MMR",
                                  "given_on": str(today),
                                  "skip_student_ids": [skip_me]})
        assert code == 201, drive
        assert drive["in_section"] == section_size, drive
        assert len(drive["recorded"]) == section_size - 1, drive
        assert len(drive["skipped"]) == 1, drive
        assert skip_me not in [r["student_id"] for r in drive["recorded"]], drive
        print(f"  {len(drive['recorded'])} of {section_size} recorded, "
              f"1 absentee skipped")

        code, twice = request("POST", "/school/wellbeing/immunisation/bulk",
                              token=tok, body={
                                  "section_id": section_id,
                                  "vaccine": f"{TAG} MMR",
                                  "given_on": str(today)})
        assert code == 201, twice
        assert len(twice["already_had_it"]) == section_size - 1, twice
        assert len(twice["recorded"]) == 1, (
            "only the child skipped the first time is recorded on the second pass")
        print("  running it again records only the child who missed it")

        section("A sanction can be signed off, once")
        code, incident = request("POST", "/school/discipline/incidents", token=tok, body={
            "student_id": child, "occurred_on": str(today - timedelta(days=2)),
            "category": "disrespect", "severity": "low",
            "description": f"{TAG} talking in assembly"})
        assert code == 201, incident
        code, withaction = request(
            "POST", f"/school/discipline/incidents/{incident['id']}/actions",
            token=tok, body={"kind": "detention",
                             "details": "one lunchtime",
                             "start_date": str(today - timedelta(days=1)),
                             "end_date": str(today - timedelta(days=1))})
        assert code == 201, withaction

        code, actions = request(
            "GET", "/school/wellbeing/discipline/actions?outstanding_only=true", token=tok)
        assert code == 200, actions
        row = next(a for a in actions["actions"]
                   if a["incident_id"] == incident["id"])
        assert row["is_served"] is False and row["overdue"] is True, (
            "a detention whose end date has passed unserved is overdue")
        action_id = row["id"]

        code, served = request(
            "POST", f"/school/wellbeing/discipline/actions/{action_id}/serve",
            token=tok, body={"served_on": str(today)})
        assert code == 200, served
        assert served["is_served"] and served["completed_by"], served
        code, twice2 = request(
            "POST", f"/school/wellbeing/discipline/actions/{action_id}/serve",
            token=tok, body={})
        assert twice2 and "already been marked" in str(twice2.get("detail", "")), twice2
        print(f"  signed off by {served['completed_by']}; a second sign-off "
              f"is refused")

        print("\nALL WELLBEING CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
