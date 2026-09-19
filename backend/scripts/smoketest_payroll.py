"""End-to-end smoke test for payroll.

Verifies (September of the current year; dev staff joined mid-month):
    Salary structures with validation (IFSC/PAN format), revisions by date.
    Run creation: staff without salary skipped and reported; mid-month joiners
      and attendance 'absent' days and approved unpaid leave become LOP.
    Pro-rating, PF (12% of basic+DA capped at 15,000), ESI only under 21,000
      contracted gross, PT, TDS, net = gross − deductions.
    Draft adjustments (bonus, LOP override) recompute; recalculation keeps overrides.
    Finalize locks edits; staff see only finalized slips; payslip PDF; bank CSV;
      mark paid; paid runs can't be reopened or deleted.

Run:
    docker exec sms-backend python -m scripts.smoketest_payroll
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from calendar import monthrange
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from sqlalchemy import select

from app.core.enums import StaffAttendanceStatus, StaffLeaveKind, StaffLeaveStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.payroll import PayrollRun, StaffSalary
from app.models.staff import Staff
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PERIOD = f"{date.today().year}-09"
Y = date.today().year
MARK = "Smoke payroll"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
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


def r1(x):
    return Decimal(x).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def cleanup(staff_ids, run_ids=()):
    db = SessionLocal()
    try:
        if run_ids:
            db.execute(PayrollRun.__table__.delete().where(PayrollRun.id.in_(run_ids)))
        db.execute(StaffSalary.__table__.delete().where(StaffSalary.staff_id.in_(staff_ids), StaffSalary.bank_name == MARK))
        db.execute(StaffAttendance.__table__.delete().where(StaffAttendance.override_remark == MARK))
        db.execute(StaffLeave.__table__.delete().where(StaffLeave.reason == MARK))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        existing = db.execute(
            select(PayrollRun).where(PayrollRun.school_id == admin.school_id, PayrollRun.period == PERIOD)
        ).scalar_one_or_none()
        if existing:
            print(f"A real payroll run for {PERIOD} exists (id={existing.id}); not touching it. Aborting.")
            sys.exit(2)
        staff = {
            u.email: (st, u)
            for st, u in db.execute(
                select(Staff, User).join(User, Staff.user_id == User.id).where(Staff.school_id == admin.school_id)
            ).all()
        }
        t_staff, t_user = staff[TEACHER[0]]
        t_user.password_hash = hash_password(TEACHER[1])
        t_user.is_active = True
        p_staff, p_user = staff["principal@sms.local"]
        a_staff, a_user = staff["accountant@sms.local"]
        for s in (t_staff, p_staff, a_staff):
            s.joining_date = date(Y, 9, 17)
        # Teacher absent on the 18th; accountant on approved unpaid leave 21st–22nd.
        db.add(StaffAttendance(
            tenant_id=admin.tenant_id, school_id=admin.school_id, user_id=t_user.id, date=date(Y, 9, 18),
            status=StaffAttendanceStatus.absent, manually_overridden=True, override_remark=MARK,
        ))
        db.add(StaffLeave(
            tenant_id=admin.tenant_id, school_id=admin.school_id, applicant_user_id=a_user.id,
            kind=StaffLeaveKind.unpaid, from_date=date(Y, 9, 21), to_date=date(Y, 9, 22),
            reason=MARK, status=StaffLeaveStatus.approved,
        ))
        db.commit()
        return {"teacher": t_staff.id, "principal": p_staff.id, "accountant": a_staff.id}
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    ids = {}
    run_ids = []
    try:
        db = SessionLocal()
        staff_ids = [s.id for s in db.execute(select(Staff).where(Staff.school_id == 1)).scalars()]
        db.close()
        cleanup(staff_ids)
        section("SETUP")
        ids = setup()
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        days = monthrange(Y, 9)[1]

        section("Salary structures")
        code, err = request("PUT", f"/school/payroll/staff/{ids['teacher']}/salary", token=tok,
                            body={"effective_from": f"{Y}-04-01", "basic": "20000", "bank_ifsc": "bad"})
        assert code == 422, err
        teacher_sal = {"effective_from": f"{Y}-04-01", "basic": "20000", "hra": "8000", "special_allowance": "2000",
                       "tds_monthly": "500", "bank_name": MARK, "bank_account_no": "123456789012",
                       "bank_ifsc": "HDFC0001234", "pan": "ABCDE1234F"}
        code, sal = request("PUT", f"/school/payroll/staff/{ids['teacher']}/salary", token=tok, body=teacher_sal)
        assert code == 200 and Decimal(sal["monthly_gross"]) == 30000, sal
        code, sal = request("PUT", f"/school/payroll/staff/{ids['principal']}/salary", token=tok,
                            body={"effective_from": f"{Y}-04-01", "basic": "10000", "hra": "4000",
                                  "other_allowance": "2000", "bank_name": MARK})
        assert code == 200, sal
        # A later revision that doesn't apply to September yet.
        code, _ = request("PUT", f"/school/payroll/staff/{ids['principal']}/salary", token=tok,
                          body={"effective_from": f"{Y + 1}-01-01", "basic": "99999", "bank_name": MARK})
        assert code == 200

        section("Create run")
        code, run = request("POST", "/school/payroll/runs", token=tok, body={"period": PERIOD})
        assert code == 201, run
        run_ids.append(run["id"])
        assert "Dev Accountant" in run["skipped_without_salary"], run["skipped_without_salary"]
        code, dup = request("POST", "/school/payroll/runs", token=tok, body={"period": PERIOD})
        assert code == 409, dup
        slips = {s["full_name"]: s for s in run["payslips"]}
        t = slips["Dev Teacher"]
        # Joined on the 17th → 16 unpaid days, plus absent on the 18th.
        assert Decimal(t["lop_days"]) == 17 and Decimal(t["lop_days_auto"]) == 17, t
        paid = Decimal(days - 17)
        assert Decimal(t["basic"]) == r1(Decimal(20000) * paid / days), t
        exp_pf = r1(min(Decimal(t["basic"]) + Decimal(t["da"]), Decimal(15000)) * Decimal("0.12"))
        assert Decimal(t["pf_employee"]) == exp_pf, t
        assert Decimal(t["esi_employee"]) == 0, "teacher's contracted gross is above the ESI ceiling"
        assert Decimal(t["tds"]) == 500 and Decimal(t["professional_tax"]) == 200
        assert Decimal(t["net_pay"]) == Decimal(t["gross"]) - Decimal(t["total_deductions"])
        p = slips["Dev Principal"]
        assert Decimal(p["basic"]) == r1(Decimal(10000) * Decimal(days - 16) / days), "revision must not apply yet"
        exp_esi = (Decimal(p["gross"]) * Decimal("0.75") / 100).quantize(Decimal("1"), rounding=ROUND_CEILING)
        assert Decimal(p["esi_employee"]) == exp_esi and Decimal(p["esi_employer"]) > 0, p
        print(f"  teacher net {t['net_pay']} (LOP 17), principal net {p['net_pay']} with ESI {p['esi_employee']}")

        section("Adjust + recalculate")
        code, adj = request("PATCH", f"/school/payroll/runs/{run['id']}/payslips/{t['id']}", token=tok,
                            body={"bonus": "1000", "lop_days": "16", "remarks": "Absence regularised"})
        assert code == 200 and Decimal(adj["lop_days"]) == 16 and Decimal(adj["bonus"]) == 1000, adj
        assert Decimal(adj["gross"]) > Decimal(t["gross"]) + 1000 - 1
        code, _ = request("PUT", f"/school/payroll/staff/{ids['accountant']}/salary", token=tok,
                          body={"effective_from": f"{Y}-04-01", "basic": "12000", "bank_name": MARK})
        code, run2 = request("POST", f"/school/payroll/runs/{run['id']}/recalculate", token=tok)
        assert code == 200 and run2["staff_count"] == 3 and not run2["skipped_without_salary"], run2
        s2 = {s["full_name"]: s for s in run2["payslips"]}
        assert Decimal(s2["Dev Teacher"]["lop_days"]) == 16, "manual LOP override kept"
        assert Decimal(s2["Dev Teacher"]["bonus"]) == 1000, "bonus kept"
        assert Decimal(s2["Dev Accountant"]["lop_days"]) == 18, s2["Dev Accountant"]  # 16 + 2 unpaid leave
        print("  overrides survive recalculation; unpaid leave counted")

        section("Staff visibility")
        code, mine = request("GET", "/staff/payslips", token=ttok)
        assert code == 200 and not any(x["run_id"] == run["id"] for x in mine), "drafts are hidden"

        section("Finalize, pay")
        code, fin = request("POST", f"/school/payroll/runs/{run['id']}/finalize", token=tok)
        assert code == 200 and fin["status"] == "finalized", fin
        code, err = request("PATCH", f"/school/payroll/runs/{run['id']}/payslips/{t['id']}", token=tok, body={"bonus": "5"})
        assert code == 400, err
        code, mine = request("GET", "/staff/payslips", token=ttok)
        mine_slip = next(x for x in mine if x["run_id"] == run["id"])
        code, pdf = request("GET", f"/staff/payslips/{mine_slip['id']}/pdf", token=ttok)
        assert code == 200 and pdf[:4] == b"%PDF"
        code, err = request("GET", f"/staff/payslips/{s2['Dev Principal']['id']}/pdf", token=ttok)
        assert code == 404, "teacher can't read someone else's payslip"
        code, csv_ = request("GET", f"/school/payroll/runs/{run['id']}/bank-file.csv", token=tok)
        assert code == 200 and b"HDFC0001234" in csv_ and b"Salary " in csv_, csv_[:200]
        code, paid_ = request("POST", f"/school/payroll/runs/{run['id']}/paid", token=tok,
                              body={"paid_on": f"{Y}-10-01", "payment_ref": "NEFT-BATCH-1"})
        assert code == 200 and paid_["status"] == "paid", paid_
        code, err = request("POST", f"/school/payroll/runs/{run['id']}/reopen", token=tok)
        assert code == 400
        code, err = request("DELETE", f"/school/payroll/runs/{run['id']}", token=tok)
        assert code == 400
        print(f"  total net {paid_['total_net']}, employer cost {paid_['total_employer_cost']}")

        print("\nALL PAYROLL CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        db = SessionLocal()
        staff_ids = [s.id for s in db.execute(select(Staff).where(Staff.school_id == 1)).scalars()]
        db.close()
        cleanup(staff_ids, run_ids)


if __name__ == "__main__":
    main()
