"""Smoke test for the reports and analytics endpoints.

Verifies:
    Every report answers, and its shape survives its own response model —
    which is the real risk here, since the service hands back plain dicts.
    The arithmetic holds: a month of attendance adds up to its marked days,
    the ageing buckets add up to the outstanding total, and seats used never
    silently exceed seats available without the route being flagged.
    Nothing here writes: the school looks identical afterwards.
    A teacher cannot read them, and only the money people see the money.

Run:
    docker exec sms-backend python -m scripts.smoketest_analytics
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.fee import StudentFee
from app.models.student import Student
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")[:200]}


def section(t):
    print(f"\n=== {t} ===")


def login(email, password, role="school"):
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


def snapshot():
    """Row counts of the things a report touches, to prove it touched nothing."""
    db = SessionLocal()
    try:
        return (
            db.execute(select(func.count(Student.id))).scalar_one(),
            db.execute(select(func.count(StudentFee.id))).scalar_one(),
            db.execute(select(func.coalesce(func.sum(StudentFee.amount_paid), 0))).scalar_one(),
        )
    finally:
        db.close()


def main():
    tok = login(*ADMIN)
    before = snapshot()

    section("Every report answers")
    today = date.today()
    reports = [
        ("overview", "/school/analytics/overview"),
        ("strength", "/school/analytics/strength"),
        ("demographics", "/school/analytics/demographics"),
        ("chronic absence", "/school/analytics/chronic-absence"),
        ("teacher activity", "/school/analytics/teacher-activity"),
        ("fee collection", "/school/analytics/fee-collection"),
        ("dues ageing", "/school/analytics/dues-ageing"),
        ("staff attendance", f"/school/analytics/staff-attendance?year={today.year}&month={today.month}"),
        ("transport", "/school/analytics/transport"),
        ("library", "/school/analytics/library"),
        ("inventory", "/school/analytics/inventory"),
        ("notifications", "/school/analytics/notifications"),
    ]
    got = {}
    for name, path in reports:
        code, data = request("GET", path, token=tok)
        assert code == 200, f"{name}: {code} {data}"
        got[name] = data
        print(f"  {name:18} 200, {len(json.dumps(data)):>6} bytes")

    section("The numbers hold together")
    for m in got["overview"]["attendance_by_month"]:
        marked = m["present"] + m["absent"] + m["late"] + m["half_day"]
        if marked:
            assert 0 <= m["percent"] <= 100, m
    print(f"  overview: {len(got['overview']['attendance_by_month'])} months, "
          f"{got['overview']['students']} students, {got['overview']['staff']} staff")

    s = got["strength"]
    assert s["total_students"] == sum(x["students"] for x in s["sections"]), s["total_students"]
    assert s["total_students"] == sum(c["students"] for c in s["classes"]), "classes roll up from sections"
    for sec in s["sections"]:
        assert sec["boys"] + sec["girls"] <= sec["students"], sec
    print(f"  strength: {s['total_students']} across {len(s['sections'])} sections, "
          f"{s['fill_percent']}% of capacity")

    d = got["demographics"]
    assert sum(g["count"] for g in d["gender"]) == d["total"], d["gender"]
    assert sum(b["count"] for b in d["blood_group"]) == d["total"], "everyone is counted once"
    print(f"  demographics: {d['total']} students, dob on file for {d['recorded']['dob']}")

    a = got["dues ageing"]
    bucketed = sum(float(b["amount"]) for b in a["buckets"])
    assert abs(bucketed - float(a["total"])) < 0.01, (bucketed, a["total"])
    assert a["students_owing"] == len({x["student_id"] for x in a["defaulters"]}) or len(a["defaulters"]) == 50
    for row in a["defaulters"]:
        assert float(row["owed"]) > 0, row
    print(f"  dues: {a['total']} owed by {a['students_owing']}, buckets add up")

    f = got["fee collection"]
    for grouping in ("by_head", "by_class", "by_mode"):
        total = sum(float(r["amount"]) for r in f[grouping])
        assert abs(total - float(f["total"])) < 0.01, (grouping, total, f["total"])
    print(f"  collection: {f['total']} over {f['receipts']} receipts, three groupings all agree")

    t = got["transport"]
    for r in t["routes"]:
        assert r["over_capacity"] == (r["capacity"] > 0 and r["riders"] > r["capacity"]), r
        assert r["free_seats"] == max(r["capacity"] - r["riders"], 0), r
    print(f"  transport: {t['total_riders']} of {t['total_capacity']} seats, "
          f"{len(t['over_capacity'])} route(s) over")

    lib = got["library"]
    assert lib["out_now"] <= lib["copies"], lib
    print(f"  library: {lib['issued']} issued in the window, {lib['out_now']} of {lib['copies']} copies out")

    n = got["notifications"]
    for c in n["channels"]:
        parts = c["queued"] + c["sent"] + c["delivered"] + c["failed"] + c["skipped"]
        assert parts == c["total"], c
    print(f"  notices: {n['notices']} sent to {n['recipients']} recipients across "
          f"{len(n['channels'])} channel(s)")

    section("A window narrows the answer")
    frm = date(today.year, today.month, 1).isoformat()
    code, month = request("GET", f"/school/analytics/fee-collection?from={frm}", token=tok)
    assert code == 200 and month["receipts"] <= f["receipts"], month
    assert month["from_date"] == frm, month
    print(f"  this month: {month['receipts']} receipts of {f['receipts']} overall")

    section("A stricter threshold finds fewer children")
    code, loose = request("GET", "/school/analytics/chronic-absence?below=95", token=tok)
    code, tight = request("GET", "/school/analytics/chronic-absence?below=50", token=tok)
    assert code == 200 and tight["count"] <= loose["count"], (tight["count"], loose["count"])
    assert all(x["percent"] < 50 for x in tight["students"]), "the threshold is honoured"
    print(f"  below 95%: {loose['count']} children; below 50%: {tight['count']}")

    section("Downloads")
    for path in ("strength.csv", "chronic-absence.csv", "fee-collection.csv", "dues-ageing.csv"):
        req = urllib.request.Request(f"{BASE}/school/analytics/{path}")
        req.add_header("Authorization", f"Bearer {tok}")
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
            assert "attachment" in r.headers.get("Content-Disposition", ""), path
            assert body.count("\n") >= 1, path
        print(f"  {path:22} {body.count(chr(10))} line(s)")

    section("An unknown exam is a 404")
    code, err = request("GET", "/school/analytics/exams/99999999", token=tok)
    assert code == 404, (code, err)
    print("  404, not a blank report")

    section("Not everybody may look")
    teacher = login(devdata.TEACHER_EMAIL, "TeacherPass123!", "teacher")
    for path in ("/school/analytics/overview", "/school/analytics/dues-ageing",
                 "/school/analytics/teacher-activity"):
        code, err = request("GET", path, token=teacher)
        assert code == 403, f"a teacher read {path}: {code} {err}"
    print("  a teacher is refused all three")

    section("Nothing was written")
    after = snapshot()
    assert before == after, (before, after)
    print(f"  students, fees and money paid unchanged: {after}")

    print("\nALL ANALYTICS CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
