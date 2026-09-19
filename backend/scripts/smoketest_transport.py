"""End-to-end smoke test for the Transport module.

Verifies:
    Crew + vehicle CRUD, duplicate registration blocked, expiry warnings.
    Route with ordered stops; stop fee overrides route fee.
    Assign student; moving routes closes the old assignment.
    Stop with students can't be removed; route with students can't be deactivated.
    Trip generation (idempotent), boarding marks, status flow, odometer check.
    GPS ingest with device key; bad key rejected; parent sees bus + boarding.
    Monthly transport fee generation (idempotent) lands in student fees.

Run:
    docker exec sms-backend python -m scripts.smoketest_transport
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
from app.models.fee import FeeHead, StudentFee
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.transport import TransportCrew, TransportRoute, Vehicle
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
PARENT_PW = "ParentPass123!"
REG = "SMK-TR-01"
ROUTE_CODES = ("SMKR1", "SMKR2")
HEAD_CODE = "SMKTRANS"


def request(method, path, *, token=None, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
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
        db.execute(
            StudentFee.__table__.delete().where(
                StudentFee.fee_head_id.in_(select(FeeHead.id).where(FeeHead.code == HEAD_CODE))
            )
        )
        route_ids = list(
            db.execute(select(TransportRoute.id).where(TransportRoute.code.in_(ROUTE_CODES))).scalars()
        )
        if route_ids:
            from app.models.transport import TransportAssignment, Trip

            db.execute(Trip.__table__.delete().where(Trip.route_id.in_(route_ids)))
            db.execute(
                TransportAssignment.__table__.delete().where(
                    TransportAssignment.route_id.in_(route_ids)
                )
            )
            db.execute(TransportRoute.__table__.delete().where(TransportRoute.id.in_(route_ids)))
        db.execute(Vehicle.__table__.delete().where(Vehicle.registration_no == REG))
        db.execute(TransportCrew.__table__.delete().where(TransportCrew.full_name.like("Smoke TR%")))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD_CODE))
        db.commit()
    finally:
        db.close()


def setup():
    """Reset admin password; find a student with a linked parent; ensure fee head."""
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        admin.is_active = True
        row = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        assert row, "Need a student with a linked parent in the dev school"
        student, parent = row
        parent.password_hash = hash_password(PARENT_PW)
        parent.is_active = True
        head = FeeHead(
            tenant_id=admin.tenant_id,
            school_id=admin.school_id,
            name="Smoke Transport",
            code=HEAD_CODE,
            is_recurring=True,
        )
        db.add(head)
        db.commit()
        return student.id, parent.email, head.id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    section("RESET + cleanup")
    cleanup()
    student_id, parent_email, head_id = setup()
    tok = login("school", *ADMIN)
    ptok = login("parent", parent_email, PARENT_PW)
    today = date.today()

    section("Crew + vehicle")
    code, driver = request(
        "POST",
        "/school/transport/crew",
        token=tok,
        body={
            "full_name": "Smoke TR Driver",
            "role": "driver",
            "phone": "9811111111",
            "license_no": "KA0120200001",
            "license_expiry": (today + timedelta(days=10)).isoformat(),
        },
    )
    assert code == 201, driver
    code, veh = request(
        "POST",
        "/school/transport/vehicles",
        token=tok,
        body={
            "registration_no": REG.lower(),
            "label": "Smoke Bus",
            "capacity": 1,
            "driver_id": driver["id"],
            "insurance_expiry": (today - timedelta(days=1)).isoformat(),
        },
    )
    assert code == 201, veh
    assert veh["registration_no"] == REG and veh["driver_name"] == "Smoke TR Driver"
    assert any("Insurance expired" in m for m in veh["expiring_documents"]), veh
    code, dup = request(
        "POST", "/school/transport/vehicles", token=tok, body={"registration_no": REG, "capacity": 10}
    )
    assert code == 409, dup
    print("  vehicle created, dup blocked, expiry flagged")

    section("Routes + stops")
    code, r1 = request(
        "POST",
        "/school/transport/routes",
        token=tok,
        body={
            "name": "Smoke North",
            "code": ROUTE_CODES[0],
            "vehicle_id": veh["id"],
            "monthly_fee": "1500",
            "stops": [
                {"name": "Stop A", "pickup_time": "07:10", "drop_time": "15:40"},
                {"name": "Stop B", "pickup_time": "07:25", "drop_time": "15:25", "monthly_fee": "1800"},
            ],
        },
    )
    assert code == 201, r1
    stop_a, stop_b = r1["stops"]
    assert stop_a["sequence"] == 1 and stop_b["sequence"] == 2
    assert float(stop_a["effective_fee"]) == 1500 and float(stop_b["effective_fee"]) == 1800
    code, r2 = request(
        "POST",
        "/school/transport/routes",
        token=tok,
        body={"name": "Smoke South", "code": ROUTE_CODES[1], "monthly_fee": "1200", "stops": [{"name": "Stop C"}]},
    )
    assert code == 201, r2

    section("Assign + move")
    code, a1 = request(
        "POST",
        "/school/transport/assignments",
        token=tok,
        body={
            "student_id": student_id,
            "route_id": r1["id"],
            "stop_id": r2["stops"][0]["id"],
        },
    )
    assert code == 400, a1  # stop from another route
    code, a1 = request(
        "POST",
        "/school/transport/assignments",
        token=tok,
        body={
            "student_id": student_id,
            "route_id": r2["id"],
            "stop_id": r2["stops"][0]["id"],
            "start_date": (today - timedelta(days=40)).isoformat(),
        },
    )
    assert code == 201, a1
    code, a2 = request(
        "POST",
        "/school/transport/assignments",
        token=tok,
        body={
            "student_id": student_id,
            "route_id": r1["id"],
            "stop_id": stop_b["id"],
            "start_date": (today - timedelta(days=5)).isoformat(),
        },
    )
    assert code == 201, a2
    code, hist = request(
        "GET", f"/school/transport/assignments?include_ended=true&route_id={r2['id']}", token=tok
    )
    old = next(x for x in hist if x["id"] == a1["id"])
    assert old["end_date"] == (today - timedelta(days=6)).isoformat(), old
    assert float(a2["monthly_fee"]) == 1800
    print("  moved routes; old assignment closed the day before")

    section("Guards")
    code, err = request(
        "PATCH",
        f"/school/transport/routes/{r1['id']}",
        token=tok,
        body={"stops": [{"id": stop_a["id"], "name": "Stop A"}]},
    )
    assert code == 400 and "still has students" in err["detail"], err
    code, err = request(
        "PATCH", f"/school/transport/routes/{r1['id']}", token=tok, body={"is_active": False}
    )
    assert code == 400, err
    code, err = request("DELETE", f"/school/transport/vehicles/{veh['id']}", token=tok)
    assert code == 400, err
    code, r1 = request(
        "PATCH",
        f"/school/transport/routes/{r1['id']}",
        token=tok,
        body={
            "stops": [
                {"id": stop_b["id"], "name": "Stop B", "monthly_fee": "1800"},
                {"id": stop_a["id"], "name": "Stop A renamed"},
                {"name": "Stop D"},
            ]
        },
    )
    assert code == 200, r1
    assert [s["name"] for s in r1["stops"]] == ["Stop B", "Stop A renamed", "Stop D"]
    print("  stop/route/vehicle guards hold; reorder + add works")

    section("Dashboard")
    code, dash = request("GET", "/school/transport/dashboard", token=tok)
    assert code == 200, dash
    assert any(o["route_id"] == r1["id"] for o in dash["overloaded_routes"]) is False  # 1 student, cap 1
    assert any("licence" in e["message"].lower() for e in dash["expiring_documents"]), dash

    section("Trips + boarding")
    code, gen = request("POST", f"/school/transport/trips/generate?on={today.isoformat()}", token=tok)
    assert code == 200 and gen["created"] >= 4, gen
    code, gen2 = request("POST", f"/school/transport/trips/generate?on={today.isoformat()}", token=tok)
    assert gen2["created"] == 0, gen2
    code, trips = request("GET", f"/school/transport/trips?on={today.isoformat()}&route_id={r1['id']}", token=tok)
    pickup = next(t for t in trips if t["direction"] == "pickup")
    assert pickup["expected"] == 1 and pickup["driver_name"] == "Smoke TR Driver", pickup
    code, err = request(
        "POST",
        f"/school/transport/trips/{pickup['id']}/boarding",
        token=tok,
        body={"marks": [{"student_id": student_id, "status": "dropped"}]},
    )
    assert code == 400, err
    code, det = request(
        "POST",
        f"/school/transport/trips/{pickup['id']}/boarding",
        token=tok,
        body={"marks": [{"student_id": student_id, "status": "boarded"}]},
    )
    assert code == 200 and det["boarded"] == 1 and det["status"] == "in_progress", det
    code, err = request(
        "PATCH",
        f"/school/transport/trips/{pickup['id']}",
        token=tok,
        body={"start_odometer_km": 500, "end_odometer_km": 400},
    )
    assert code == 422, err
    code, det = request(
        "PATCH",
        f"/school/transport/trips/{pickup['id']}",
        token=tok,
        body={"status": "completed", "start_odometer_km": 500, "end_odometer_km": 523},
    )
    assert code == 200 and det["distance_km"] == 23 and det["status"] == "completed", det
    code, err = request(
        "PATCH", f"/school/transport/trips/{pickup['id']}", token=tok, body={"status": "in_progress"}
    )
    assert code == 400, err
    print("  generated, boarded, completed; flow enforced")

    section("GPS")
    code, key = request("POST", f"/school/transport/vehicles/{veh['id']}/gps-key", token=tok)
    assert code == 200, key
    code, err = request(
        "POST", "/public/transport/gps", body={"lat": 12.97, "lng": 77.59}, headers={"X-Device-Key": "nope"}
    )
    assert code == 401, err
    code, ack = request(
        "POST",
        "/public/transport/gps",
        body={"lat": 12.9716, "lng": 77.5946, "speed_kmph": 32},
        headers={"X-Device-Key": key["gps_api_key"]},
    )
    assert code == 200 and ack["vehicle_id"] == veh["id"], ack
    code, pts = request("GET", f"/school/transport/vehicles/{veh['id']}/locations", token=tok)
    assert len(pts) == 1, pts

    section("Parent view")
    code, child = request("GET", f"/parent/me/children/{student_id}/transport", token=ptok)
    assert code == 200 and child, child
    assert child["stop_name"] == "Stop B" and child["driver_phone"] == "9811111111", child
    assert child["last_lat"] == 12.9716
    assert any(t["direction"] == "pickup" and t["boarding_status"] == "boarded" for t in child["today"]), child
    print("  parent sees stop, driver, bus location and boarding")

    section("Fees")
    period = today.strftime("%Y-%m")
    code, res = request(
        "POST",
        "/school/transport/fees/generate",
        token=tok,
        body={"fee_head_id": head_id, "period": period},
    )
    assert code == 200, res
    # The student moved routes this month: billed once, at the new stop's rate.
    code, fees = request("GET", f"/parent/me/children/{student_id}/fees", token=ptok)
    mine = [f for f in fees if f["fee_head_code"] == HEAD_CODE and f["period"] == period]
    assert len(mine) == 1 and float(mine[0]["amount_due"]) == 1800, mine
    code, res2 = request(
        "POST",
        "/school/transport/fees/generate",
        token=tok,
        body={"fee_head_id": head_id, "period": period},
    )
    assert res2["created"] == 0 and res2["skipped"] >= 1, res2
    code, fees = request("GET", f"/parent/me/children/{student_id}/fees", token=ptok)
    assert any(f["fee_head_code"] == HEAD_CODE and f["period"] == period for f in fees), fees
    print(f"  raised {res['created']} fee(s) totalling {res['total_amount']}; rerun idempotent")

    cleanup()
    print("\nALL TRANSPORT CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        cleanup()
        sys.exit(1)
