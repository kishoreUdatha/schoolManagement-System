"""Monthly payroll.

Pay is pro-rated on calendar days: earned = monthly × (days − LOP) / days.
Loss-of-pay days come from staff attendance marked `absent` plus approved
*unpaid* leave in the month; days with no attendance row are not counted
against anyone. The office can override LOP, add bonus / other deductions
and TDS while the run is a draft. Finalizing freezes the numbers.
"""
import csv
import io
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    PayrollRunStatus,
    StaffAttendanceStatus,
    StaffLeaveKind,
    StaffLeaveStatus,
)
from app.models.payroll import PayrollRun, PayrollSettings, Payslip, StaffSalary
from app.models.staff import Staff
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.tenant import School
from app.models.user import User
from app.schemas.payroll import PayslipAdjust, RunPaid, SalaryIn, SettingsUpdate


ZERO = Decimal("0")
EARNINGS = ("basic", "da", "hra", "conveyance", "special_allowance", "other_allowance")


def _r(x: Decimal) -> Decimal:
    """Round to whole rupees (payslips and bank files use whole rupees)."""
    return Decimal(x).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _period_bounds(period: str) -> tuple[date, date, int]:
    y, m = (int(p) for p in period.split("-"))
    days = monthrange(y, m)[1]
    return date(y, m, 1), date(y, m, days), days


# --- Settings ---

def get_settings(db: Session, tenant_id: int, school_id: int) -> PayrollSettings:
    s = db.execute(select(PayrollSettings).where(PayrollSettings.school_id == school_id)).scalar_one_or_none()
    if s is None:
        s = PayrollSettings(tenant_id=tenant_id, school_id=school_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def update_settings(db: Session, tenant_id: int, school_id: int, data: SettingsUpdate) -> PayrollSettings:
    s = get_settings(db, tenant_id, school_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


# --- Salary structures ---

def _staff(db: Session, staff_id: int, school_id: int) -> Staff:
    s = db.get(Staff, staff_id)
    if not s or s.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return s


def salary_to_read(sal: StaffSalary) -> dict:
    d = {c: getattr(sal, c) for c in SalaryIn.model_fields}
    d.update(id=sal.id, staff_id=sal.staff_id, monthly_gross=sum((getattr(sal, c) for c in EARNINGS), ZERO))
    return d


def current_salary(db: Session, staff_id: int, on: date) -> Optional[StaffSalary]:
    return db.execute(
        select(StaffSalary)
        .where(StaffSalary.staff_id == staff_id, StaffSalary.effective_from <= on)
        .order_by(StaffSalary.effective_from.desc())
        .limit(1)
    ).scalar_one_or_none()


def set_salary(db: Session, tenant_id: int, school_id: int, staff_id: int, data: SalaryIn) -> StaffSalary:
    staff = _staff(db, staff_id, school_id)
    existing = db.execute(
        select(StaffSalary).where(StaffSalary.staff_id == staff.id, StaffSalary.effective_from == data.effective_from)
    ).scalar_one_or_none()
    sal = existing or StaffSalary(tenant_id=tenant_id, school_id=school_id, staff_id=staff.id)
    for k, v in data.model_dump().items():
        setattr(sal, k, v)
    if existing is None:
        db.add(sal)
    db.commit()
    db.refresh(sal)
    return sal


def salary_history(db: Session, staff_id: int, school_id: int) -> list[StaffSalary]:
    _staff(db, staff_id, school_id)
    return list(
        db.execute(
            select(StaffSalary).where(StaffSalary.staff_id == staff_id).order_by(StaffSalary.effective_from.desc())
        ).scalars()
    )


def staff_pay_rows(db: Session, school_id: int) -> list[dict]:
    today = date.today()
    rows = db.execute(
        select(Staff, User)
        .join(User, Staff.user_id == User.id)
        .where(Staff.school_id == school_id)
        .order_by(User.is_active.desc(), User.full_name)
    ).all()
    out = []
    for st, u in rows:
        sal = current_salary(db, st.id, today) or db.execute(
            select(StaffSalary).where(StaffSalary.staff_id == st.id).order_by(StaffSalary.effective_from).limit(1)
        ).scalar_one_or_none()
        out.append(
            {
                "staff_id": st.id,
                "user_id": u.id,
                "full_name": u.full_name,
                "employee_no": st.employee_no,
                "designation": st.designation,
                "is_active": u.is_active,
                "salary": salary_to_read(sal) if sal else None,
            }
        )
    return out


# --- Computation ---

def auto_lop_days(db: Session, user_id: int, first: date, last: date) -> Decimal:
    absent = {
        d
        for (d,) in db.execute(
            select(StaffAttendance.date).where(
                StaffAttendance.user_id == user_id,
                StaffAttendance.date.between(first, last),
                StaffAttendance.status == StaffAttendanceStatus.absent,
            )
        ).all()
    }
    unpaid = set()
    for lv in db.execute(
        select(StaffLeave).where(
            StaffLeave.applicant_user_id == user_id,
            StaffLeave.kind == StaffLeaveKind.unpaid,
            StaffLeave.status == StaffLeaveStatus.approved,
            StaffLeave.from_date <= last,
            StaffLeave.to_date >= first,
        )
    ).scalars():
        d = max(lv.from_date, first)
        while d <= min(lv.to_date, last):
            unpaid.add(d)
            d += timedelta(days=1)
    return Decimal(len(absent | unpaid))


def _compute(slip: Payslip, sal: StaffSalary, cfg: PayrollSettings) -> None:
    days = Decimal(slip.days_in_month)
    lop = min(Decimal(slip.lop_days), days)
    factor = (days - lop) / days
    for c in EARNINGS:
        setattr(slip, c, _r(getattr(sal, c) * factor))
    earned = sum((getattr(slip, c) for c in EARNINGS), ZERO)
    slip.gross = earned + slip.bonus

    pf_wage = min(slip.basic + slip.da, cfg.pf_wage_ceiling)
    slip.pf_employee = _r(pf_wage * cfg.pf_employee_rate / 100) if sal.pf_applicable else ZERO
    slip.pf_employer = _r(pf_wage * cfg.pf_employer_rate / 100) if sal.pf_applicable else ZERO

    # ESI eligibility is decided on the contracted monthly gross, not the pro-rated one.
    monthly_gross = sum((getattr(sal, c) for c in EARNINGS), ZERO)
    esi_ok = sal.esi_applicable and monthly_gross <= cfg.esi_gross_ceiling
    # ESIC rounds contributions up to the next rupee.
    ceil = lambda x: Decimal(x).quantize(Decimal("1"), rounding="ROUND_CEILING")  # noqa: E731
    slip.esi_employee = ceil(slip.gross * cfg.esi_employee_rate / 100) if esi_ok else ZERO
    slip.esi_employer = ceil(slip.gross * cfg.esi_employer_rate / 100) if esi_ok else ZERO

    pt = sal.professional_tax if sal.professional_tax is not None else cfg.default_professional_tax
    slip.professional_tax = pt if slip.gross > 0 else ZERO

    slip.total_deductions = (
        slip.pf_employee + slip.esi_employee + slip.professional_tax + slip.tds + slip.other_deduction
    )
    slip.net_pay = max(slip.gross - slip.total_deductions, ZERO)


def _get_run(db: Session, run_id: int, school_id: int) -> PayrollRun:
    r = db.get(PayrollRun, run_id)
    if not r or r.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll run not found")
    return r


def _require_draft(run: PayrollRun) -> None:
    if run.status != PayrollRunStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payroll for {run.period} is {run.status.value}; it can't be changed",
        )


def _build_slips(db: Session, run: PayrollRun) -> list[str]:
    """(Re)create slips for every active staff member with a salary. Keeps
    manual adjustments (bonus, other deduction, TDS override, LOP override)."""
    first, last, days = _period_bounds(run.period)
    cfg = get_settings(db, run.tenant_id, run.school_id)
    existing = {s.staff_id: s for s in db.execute(select(Payslip).where(Payslip.run_id == run.id)).scalars()}
    skipped = []
    seen = set()
    for st, u in db.execute(
        select(Staff, User)
        .join(User, Staff.user_id == User.id)
        .where(Staff.school_id == run.school_id, User.is_active.is_(True))
    ).all():
        if st.joining_date and st.joining_date > last:
            continue
        sal = current_salary(db, st.id, last)
        if sal is None:
            skipped.append(u.full_name)
            continue
        seen.add(st.id)
        auto = auto_lop_days(db, u.id, first, last)
        # Joined mid-month: days before joining are unpaid.
        if st.joining_date and st.joining_date > first:
            auto += Decimal((st.joining_date - first).days)
        slip = existing.get(st.id)
        if slip is None:
            slip = Payslip(run_id=run.id, staff_id=st.id, user_id=u.id, lop_days=auto, tds=sal.tds_monthly)
            db.add(slip)
        elif slip.lop_days == slip.lop_days_auto:
            slip.lop_days = auto  # not overridden → follow attendance
        slip.lop_days_auto = auto
        slip.salary_id = sal.id
        slip.days_in_month = days
        for field in ("bonus", "other_deduction", "tds"):
            if getattr(slip, field) is None:
                setattr(slip, field, ZERO)
        _compute(slip, sal, cfg)
    for staff_id, slip in existing.items():
        if staff_id not in seen:
            db.delete(slip)
    return skipped


def create_run(db: Session, tenant_id: int, school_id: int, actor_id: int, period: str) -> tuple[PayrollRun, list[str]]:
    first, _, _ = _period_bounds(period)
    if first > date.today().replace(day=1) + timedelta(days=31):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can't run payroll more than a month ahead")
    run = PayrollRun(tenant_id=tenant_id, school_id=school_id, period=period, created_by_user_id=actor_id)
    db.add(run)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payroll for {period} already exists")
    skipped = _build_slips(db, run)
    db.commit()
    db.refresh(run)
    return run, skipped


def recalculate(db: Session, run_id: int, school_id: int) -> tuple[PayrollRun, list[str]]:
    run = _get_run(db, run_id, school_id)
    _require_draft(run)
    skipped = _build_slips(db, run)
    db.commit()
    db.refresh(run)
    return run, skipped


def adjust_slip(db: Session, run_id: int, slip_id: int, school_id: int, data: PayslipAdjust) -> Payslip:
    run = _get_run(db, run_id, school_id)
    _require_draft(run)
    slip = db.get(Payslip, slip_id)
    if not slip or slip.run_id != run.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "lop_days" and v is not None and v > slip.days_in_month:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="LOP days exceed days in month")
        setattr(slip, k, v if v is not None or k == "remarks" else ZERO)
    sal = db.get(StaffSalary, slip.salary_id) if slip.salary_id else None
    if sal is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Salary structure was removed; recalculate the run")
    _compute(slip, sal, get_settings(db, run.tenant_id, run.school_id))
    db.commit()
    db.refresh(slip)
    return slip


def finalize(db: Session, run_id: int, school_id: int, actor_id: int) -> PayrollRun:
    run = _get_run(db, run_id, school_id)
    _require_draft(run)
    if not db.execute(select(Payslip.id).where(Payslip.run_id == run.id)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No payslips in this run")
    run.status = PayrollRunStatus.finalized
    run.finalized_at = datetime.now(timezone.utc)
    run.finalized_by_user_id = actor_id
    db.commit()
    db.refresh(run)
    return run


def reopen(db: Session, run_id: int, school_id: int) -> PayrollRun:
    run = _get_run(db, run_id, school_id)
    if run.status != PayrollRunStatus.finalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only finalized (unpaid) runs can be reopened")
    run.status = PayrollRunStatus.draft
    run.finalized_at = None
    db.commit()
    db.refresh(run)
    return run


def mark_paid(db: Session, run_id: int, school_id: int, data: RunPaid) -> PayrollRun:
    run = _get_run(db, run_id, school_id)
    if run.status != PayrollRunStatus.finalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Finalize the payroll before marking it paid")
    run.status = PayrollRunStatus.paid
    run.paid_on = data.paid_on
    run.payment_ref = data.payment_ref
    db.commit()
    db.refresh(run)
    return run


def delete_run(db: Session, run_id: int, school_id: int) -> None:
    run = _get_run(db, run_id, school_id)
    _require_draft(run)
    db.delete(run)
    db.commit()


# --- Read models ---

def slip_to_read(db: Session, slip: Payslip, run: PayrollRun) -> dict:
    st = db.get(Staff, slip.staff_id)
    u = db.get(User, slip.user_id)
    d = {c.name: getattr(slip, c.name) for c in Payslip.__table__.columns}
    d.update(
        period=run.period,
        run_status=run.status,
        full_name=u.full_name if u else "",
        employee_no=st.employee_no if st else "",
        designation=st.designation if st else None,
        paid_days=Decimal(slip.days_in_month) - Decimal(slip.lop_days),
    )
    return d


def run_to_read(db: Session, run: PayrollRun, *, with_slips: bool = False, skipped: Optional[list[str]] = None) -> dict:
    slips = list(
        db.execute(
            select(Payslip).join(User, Payslip.user_id == User.id).where(Payslip.run_id == run.id).order_by(User.full_name)
        ).scalars()
    )
    d = {
        "id": run.id,
        "period": run.period,
        "status": run.status,
        "staff_count": len(slips),
        "total_gross": sum((s.gross for s in slips), ZERO),
        "total_deductions": sum((s.total_deductions for s in slips), ZERO),
        "total_net": sum((s.net_pay for s in slips), ZERO),
        "total_employer_cost": sum((s.gross + s.pf_employer + s.esi_employer for s in slips), ZERO),
        "skipped_without_salary": skipped or [],
        "finalized_at": run.finalized_at,
        "paid_on": run.paid_on,
        "payment_ref": run.payment_ref,
        "created_at": run.created_at,
    }
    if with_slips:
        d["payslips"] = [slip_to_read(db, s, run) for s in slips]
    return d


def list_runs(db: Session, school_id: int) -> list[PayrollRun]:
    return list(
        db.execute(select(PayrollRun).where(PayrollRun.school_id == school_id).order_by(PayrollRun.period.desc())).scalars()
    )


def get_run(db: Session, run_id: int, school_id: int) -> PayrollRun:
    return _get_run(db, run_id, school_id)


def bank_file(db: Session, run_id: int, school_id: int) -> tuple[str, str]:
    """CSV the accountant uploads to the bank's bulk-transfer portal."""
    run = _get_run(db, run_id, school_id)
    if run.status == PayrollRunStatus.draft:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Finalize the payroll first")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Employee No", "Name", "Bank", "Account No", "IFSC", "Amount", "Narration"])
    missing = 0
    for s in db.execute(select(Payslip).where(Payslip.run_id == run.id)).scalars():
        sal = db.get(StaffSalary, s.salary_id) if s.salary_id else None
        st = db.get(Staff, s.staff_id)
        u = db.get(User, s.user_id)
        if not sal or not sal.bank_account_no or not sal.bank_ifsc:
            missing += 1
        w.writerow([
            st.employee_no if st else "",
            u.full_name if u else "",
            sal.bank_name if sal else "",
            sal.bank_account_no if sal else "",
            sal.bank_ifsc if sal else "",
            f"{s.net_pay:.2f}",
            f"Salary {run.period}",
        ])
    return buf.getvalue(), f"salary-{run.period}{'-INCOMPLETE' if missing else ''}.csv"


# --- Staff self-service ---

def my_payslips(db: Session, user_id: int) -> list[tuple[Payslip, PayrollRun]]:
    return list(
        db.execute(
            select(Payslip, PayrollRun)
            .join(PayrollRun, Payslip.run_id == PayrollRun.id)
            .where(Payslip.user_id == user_id, PayrollRun.status != PayrollRunStatus.draft)
            .order_by(PayrollRun.period.desc())
        ).all()
    )


def get_slip(db: Session, slip_id: int, *, school_id: Optional[int] = None, user_id: Optional[int] = None) -> tuple[Payslip, PayrollRun]:
    row = db.execute(
        select(Payslip, PayrollRun).join(PayrollRun, Payslip.run_id == PayrollRun.id).where(Payslip.id == slip_id)
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    slip, run = row
    if school_id is not None and run.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    if user_id is not None and (slip.user_id != user_id or run.status == PayrollRunStatus.draft):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    return slip, run


def payslip_pdf(db: Session, slip: Payslip, run: PayrollRun) -> tuple[bytes, str]:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    d = slip_to_read(db, slip, run)
    school = db.get(School, run.school_id)
    sal = db.get(StaffSalary, slip.salary_id) if slip.salary_id else None
    y, m = (int(p) for p in run.period.split("-"))
    month = date(y, m, 1).strftime("%B %Y")
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.8 * cm, rightMargin=1.8 * cm, topMargin=1.5 * cm)
    money = lambda v: f"{Decimal(v):,.2f}"  # noqa: E731

    els = [
        Paragraph(f"<b>{school.name if school else ''}</b>", styles["Title"]),
        Paragraph((school.address or "") if school else "", styles["Normal"]),
        Spacer(1, 0.2 * cm),
        Paragraph(f"<b>Payslip for {month}</b>", styles["Heading2"]),
    ]
    info = [
        ["Employee", d["full_name"], "Employee no.", d["employee_no"]],
        ["Designation", d["designation"] or "", "Days paid", f"{d['paid_days']} / {d['days_in_month']}"],
        ["PAN", (sal.pan if sal else "") or "", "UAN", (sal.uan if sal else "") or ""],
        ["Bank A/c", (sal.bank_account_no if sal else "") or "", "LOP days", str(d["lop_days"])],
    ]
    t = Table(info, colWidths=[3 * cm, 5.4 * cm, 3 * cm, 5.4 * cm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey), ("TEXTCOLOR", (2, 0), (2, -1), colors.grey)]))
    els += [t, Spacer(1, 0.4 * cm)]

    earnings = [(label, d[k]) for k, label in (
        ("basic", "Basic"), ("da", "Dearness allowance"), ("hra", "House rent allowance"),
        ("conveyance", "Conveyance"), ("special_allowance", "Special allowance"),
        ("other_allowance", "Other allowance"), ("bonus", "Bonus / arrears"),
    ) if d[k]]
    deductions = [(label, d[k]) for k, label in (
        ("pf_employee", "Provident fund"), ("esi_employee", "ESI"), ("professional_tax", "Professional tax"),
        ("tds", "Income tax (TDS)"), ("other_deduction", "Other deductions"),
    ) if d[k]]
    n = max(len(earnings), len(deductions))
    rows = [["Earnings", "Amount (Rs.)", "Deductions", "Amount (Rs.)"]]
    for i in range(n):
        e = earnings[i] if i < len(earnings) else ("", None)
        x = deductions[i] if i < len(deductions) else ("", None)
        rows.append([e[0], money(e[1]) if e[1] is not None else "", x[0], money(x[1]) if x[1] is not None else ""])
    rows.append(["Gross earnings", money(d["gross"]), "Total deductions", money(d["total_deductions"])])
    table = Table(rows, colWidths=[5 * cm, 3.4 * cm, 5 * cm, 3.4 * cm])
    table.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("ALIGN", (3, 0), (3, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ])
    )
    els += [table, Spacer(1, 0.4 * cm)]
    els.append(Paragraph(f"<b>Net pay: Rs. {money(d['net_pay'])}</b>", styles["Heading3"]))
    if d["pf_employer"] or d["esi_employer"]:
        els.append(Paragraph(
            f"Employer contributions (not deducted): PF Rs. {money(d['pf_employer'])}, ESI Rs. {money(d['esi_employer'])}",
            styles["Normal"],
        ))
    if d.get("remarks"):
        els.append(Paragraph(f"Remarks: {d['remarks']}", styles["Normal"]))
    els += [Spacer(1, 0.8 * cm), Paragraph("This is a computer-generated payslip and does not need a signature.", styles["Italic"])]
    doc.build(els)
    return buf.getvalue(), f"payslip-{d['employee_no']}-{run.period}.pdf"
