"""The fee office's everyday reports, alongside the finance summary:
month-wise collections, dues by class and by branch, the students on one fee
type, bounced cheques, concessions given, and reminder slips to print for
parents.
"""
from __future__ import annotations

import io
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ChequeStatus, FeeStatus
from app.models.academic import SchoolClass, Section
from app.models.accounts import Cheque, Concession, FeeCollection
from app.models.fee import FeeHead, StudentFee
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User

ZERO = Decimal("0")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_CONCESSION = re.compile(r"^Concession \((.+?)\) .*?: -([\d,]+\.\d{2})")


def fy(on: Optional[date] = None) -> tuple[date, date]:
    on = on or date.today()
    start = date(on.year if on.month >= 4 else on.year - 1, 4, 1)
    return start, date(start.year + 1, 3, 31)


def _labels(db: Session, school_id: int) -> tuple[dict[int, Section], dict[int, str]]:
    secs = {s.id: s for s in db.execute(select(Section).join(SchoolClass, SchoolClass.id == Section.class_id)
                                         .where(SchoolClass.school_id == school_id)).scalars()}
    classes = dict(db.execute(select(SchoolClass.id, SchoolClass.name).where(SchoolClass.school_id == school_id)).all())
    return secs, classes


# ---------- collections ----------


def monthly_collections(db: Session, school_id: int, year_from: Optional[date] = None) -> dict:
    start, end = fy(year_from)
    month = func.date_trunc("month", FeeCollection.collected_on)
    rows = db.execute(
        select(month, FeeCollection.mode,
               func.count(func.distinct(FeeCollection.receipt_no)), func.sum(FeeCollection.amount))
        .where(FeeCollection.school_id == school_id, FeeCollection.collected_on.between(start, end))
        .group_by(month, FeeCollection.mode)
    ).all()
    by = defaultdict(lambda: {"receipts": 0, "total": ZERO, "modes": defaultdict(lambda: ZERO)})
    modes = set()
    for month, mode, n, amt in rows:
        k = (month.year, month.month)
        by[k]["receipts"] += n
        by[k]["total"] += amt
        by[k]["modes"][mode.value] += amt
        modes.add(mode.value)
    out = []
    y, m = start.year, 4
    for _ in range(12):
        v = by.get((y, m))
        out.append({"month": f"{y}-{m:02d}", "label": f"{MONTHS[m - 1]} {y}", "receipts": v["receipts"] if v else 0,
                    "total": v["total"] if v else ZERO, "modes": dict(v["modes"]) if v else {}})
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return {"year_from": start, "year_to": end, "modes": sorted(modes), "months": out,
            "total": sum((r["total"] for r in out), ZERO), "receipts": sum(r["receipts"] for r in out)}


# ---------- dues ----------


def _dues_rows(db: Session, school_id: int):
    """Every fee still owed (or part paid) and every fee raised, per student."""
    return db.execute(
        select(StudentFee.student_id, StudentFee.amount_due, StudentFee.amount_paid, StudentFee.status,
               StudentFee.due_date, Student.section_id, Student.is_active)
        .join(Student, Student.id == StudentFee.student_id)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id)
        .where(StudentFee.school_id == school_id, StudentFee.status != FeeStatus.waived, FeeHead.code != "ADVANCE")
    ).all()


def dues_by(db: Session, school_id: int, by: str) -> dict:
    """Raised, paid and still due, per class (by='class') or per branch."""
    secs, classes = _labels(db, school_id)
    branches: dict[Optional[int], str] = {None: "No branch set"}
    if by == "branch":
        from app.models.rbac import Branch

        branches.update(dict(db.execute(select(Branch.id, Branch.name).where(Branch.school_id == school_id)).all()))
    today = date.today()
    groups: dict = defaultdict(lambda: {"students": set(), "owing": set(), "raised": ZERO, "paid": ZERO, "due": ZERO, "overdue": ZERO})
    for sid, amt_due, paid, st, due_date, section_id, active in _dues_rows(db, school_id):
        sec = secs.get(section_id)
        if by == "branch":
            key = branches.get(sec.branch_id if sec else None, "No branch set")
        else:
            key = f"{classes.get(sec.class_id, 'No class')} {sec.name}".strip() if sec else "No class"
        g = groups[key]
        g["students"].add(sid)
        g["raised"] += amt_due
        g["paid"] += paid
        left = amt_due - paid if st == FeeStatus.pending else ZERO
        if left > 0:
            g["due"] += left
            g["owing"].add(sid)
            if due_date < today:
                g["overdue"] += left
    rows = [{"name": k, "students": len(v["students"]), "students_owing": len(v["owing"]), "raised": v["raised"],
             "paid": v["paid"], "due": v["due"], "overdue": v["overdue"],
             "collected_pct": round(float(v["paid"] / v["raised"] * 100), 1) if v["raised"] else None}
            for k, v in groups.items()]
    rows.sort(key=lambda r: (r["name"].split(" ")[0] if by == "class" else r["name"], r["name"]))
    if by == "class":
        rows.sort(key=lambda r: _class_order(r["name"]))
    tot = {k: sum((r[k] for r in rows), ZERO) for k in ("raised", "paid", "due", "overdue")}
    return {"by": by, "rows": rows, "totals": tot,
            "students_owing": sum(r["students_owing"] for r in rows)}


def _class_order(name: str):
    m = re.search(r"(\d+)", name)
    pre = {"nursery": -3, "lkg": -2, "ukg": -1}.get(name.split(" ")[0].lower())
    return (pre if pre is not None else int(m.group(1)) if m else 99, name)


# ---------- one fee type ----------


def head_students(db: Session, school_id: int, fee_head_id: int, state: str = "all") -> dict:
    head = db.get(FeeHead, fee_head_id)
    if not head or head.school_id != school_id:
        return {"head": None, "rows": []}
    secs, classes = _labels(db, school_id)
    q = (select(StudentFee, Student).join(Student, Student.id == StudentFee.student_id)
         .where(StudentFee.school_id == school_id, StudentFee.fee_head_id == fee_head_id))
    rows = []
    for sf, st in db.execute(q.order_by(Student.full_name, StudentFee.period)).all():
        left = sf.amount_due - sf.amount_paid if sf.status == FeeStatus.pending else ZERO
        state_of = "waived" if sf.status == FeeStatus.waived else "paid" if left <= 0 else "part paid" if sf.amount_paid > 0 else "unpaid"
        if state == "unpaid" and state_of not in ("unpaid", "part paid"):
            continue
        if state == "paid" and state_of != "paid":
            continue
        sec = secs.get(st.section_id)
        rows.append({"student_id": st.id, "student_name": st.full_name, "admission_no": st.admission_no,
                     "class_label": f"{classes.get(sec.class_id, '')} {sec.name}".strip() if sec else None,
                     "period": sf.period, "due_date": sf.due_date, "amount_due": sf.amount_due,
                     "amount_paid": sf.amount_paid, "outstanding": left, "state": state_of})
    return {"head": {"id": head.id, "name": head.name}, "rows": rows,
            "totals": {k: sum((r[k] for r in rows), ZERO) for k in ("amount_due", "amount_paid", "outstanding")}}


# ---------- cheques ----------


def bounced_cheques(db: Session, school_id: int, frm: date, to: date) -> dict:
    rows = db.execute(
        select(Cheque, Student).join(Student, Student.id == Cheque.student_id)
        .where(Cheque.school_id == school_id, Cheque.status == ChequeStatus.bounced, Cheque.received_on.between(frm, to))
        .order_by(Cheque.received_on.desc())
    ).all()
    out = [{"id": c.id, "cheque_no": c.cheque_no, "bank_name": c.bank_name, "drawer_name": c.drawer_name,
            "cheque_date": c.cheque_date, "received_on": c.received_on, "amount": c.amount, "reason": c.bounce_reason,
            "student_id": st.id, "student_name": st.full_name, "admission_no": st.admission_no,
            "charge_raised": bool(c.bounce_charge_fee_id)} for c, st in rows]
    return {"rows": out, "total": sum((r["amount"] for r in out), ZERO)}


# ---------- concessions ----------


def concessions(db: Session, school_id: int, year_from: Optional[date] = None) -> dict:
    """Concessions given, and what they took off fees falling due this year
    (read from the note each discounted fee carries)."""
    start, end = fy(year_from)
    secs, classes = _labels(db, school_id)
    conceded: dict[tuple[int, str], Decimal] = defaultdict(lambda: ZERO)
    for sid, note in db.execute(select(StudentFee.student_id, StudentFee.notes).where(
        StudentFee.school_id == school_id, StudentFee.notes.like("Concession (%"),
        StudentFee.due_date.between(start, end),
    )).all():
        m = _CONCESSION.match(note or "")
        if m:
            conceded[(sid, m.group(1))] += Decimal(m.group(2).replace(",", ""))
    rows = []
    heads = dict(db.execute(select(FeeHead.id, FeeHead.name).where(FeeHead.school_id == school_id)).all())
    names = {}
    for c, st in db.execute(select(Concession, Student).join(Student, Student.id == Concession.student_id)
                            .where(Concession.school_id == school_id).order_by(Concession.reason, Student.full_name)).all():
        sec = secs.get(st.section_id)
        status = c.approval_status if c.approval_status != "approved" else ("in force" if c.is_active else "ended")
        if c.approved_by_user_id and c.approved_by_user_id not in names:
            u = db.get(User, c.approved_by_user_id)
            names[c.approved_by_user_id] = u.full_name if u else ""
        rows.append({
            "id": c.id, "student_id": st.id, "student_name": st.full_name, "admission_no": st.admission_no,
            "class_label": f"{classes.get(sec.class_id, '')} {sec.name}".strip() if sec else None,
            "reason": c.reason, "fee": heads.get(c.fee_head_id, "All fees") if c.fee_head_id else "All fees",
            "value": f"{c.value.normalize():f}%" if c.kind.value == "percent" else f"Rs {c.value:,.0f}",
            "valid_from": c.valid_from, "valid_to": c.valid_to, "status": status,
            "approved_by_name": names.get(c.approved_by_user_id),
            "conceded_this_year": conceded.get((st.id, c.reason), ZERO),
        })
    by_reason: dict[str, dict] = defaultdict(lambda: {"students": set(), "count": 0, "amount": ZERO})
    for r in rows:
        if r["status"] in ("pending", "rejected"):
            continue
        g = by_reason[r["reason"]]
        g["students"].add(r["student_id"])
        g["count"] += 1
    for (sid, reason), amt in conceded.items():
        by_reason[reason]["students"].add(sid)
        by_reason[reason]["amount"] += amt
    return {
        "year_from": start, "year_to": end, "rows": rows,
        "by_reason": sorted(({"reason": k, "students": len(v["students"]), "concessions": v["count"], "amount": v["amount"]}
                             for k, v in by_reason.items()), key=lambda x: -x["amount"]),
        "total": sum(conceded.values(), ZERO),
        "pending": sum(1 for r in rows if r["status"] == "pending"),
    }


# ---------- reminder slips ----------


def reminder_slips_pdf(db: Session, school_id: int, *, class_id: Optional[int] = None, section_id: Optional[int] = None,
                       student_ids: Optional[list[int]] = None, overdue_only: bool = False, pay_by: Optional[date] = None) -> tuple[bytes, str, int]:
    """A printable slip per student who owes, three to a page, to send home."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from app.services.receipt_service import _inr, _period

    school = db.get(School, school_id)
    secs, classes = _labels(db, school_id)
    today = date.today()
    q = (select(StudentFee, Student, FeeHead.name).join(Student, Student.id == StudentFee.student_id)
         .join(FeeHead, FeeHead.id == StudentFee.fee_head_id)
         .where(StudentFee.school_id == school_id, StudentFee.status == FeeStatus.pending,
                StudentFee.amount_paid < StudentFee.amount_due, Student.is_active.is_(True)))
    if overdue_only:
        q = q.where(StudentFee.due_date < today)
    if section_id:
        q = q.where(Student.section_id == section_id)
    elif class_id:
        q = q.where(Student.section_id.in_([s.id for s in secs.values() if s.class_id == class_id] or [-1]))
    if student_ids:
        q = q.where(Student.id.in_(student_ids))
    per: dict[int, dict] = {}
    for sf, st, hname in db.execute(q.order_by(Student.section_id, Student.full_name, StudentFee.due_date)).all():
        p = per.setdefault(st.id, {"st": st, "lines": []})
        p["lines"].append((f"{hname}{_period(sf.period)}", sf.due_date, sf.amount_due - sf.amount_paid))
    ink, muted, line = colors.HexColor("#14213d"), colors.HexColor("#5b6b85"), colors.HexColor("#c9d6ea")
    st_ = lambda size=9, c=ink, bold=False, align=0: ParagraphStyle(  # noqa: E731
        "s", fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size, leading=size * 1.3, textColor=c, alignment=align)
    story = []
    for i, p in enumerate(per.values()):
        st = p["st"]
        sec = secs.get(st.section_id)
        klass = f"{classes.get(sec.class_id, '')} {sec.name}".strip() if sec else ""
        total = sum((x[2] for x in p["lines"]), ZERO)
        rows = [[Paragraph("Fee", st_(8.5, muted, True)), Paragraph("Due on", st_(8.5, muted, True)), Paragraph("Amount", st_(8.5, muted, True, 2))]]
        rows += [[Paragraph(n, st_()), Paragraph(f"{d:%d %b %Y}{' (overdue)' if d < today else ''}", st_(9, colors.HexColor("#b3261e") if d < today else ink)),
                  Paragraph(_inr(a), st_(align=2))] for n, d, a in p["lines"]]
        rows += [[Paragraph("Total due", st_(10, ink, True)), "", Paragraph(_inr(total), st_(11, ink, True, 2))]]
        t = Table(rows, colWidths=[95 * mm, 45 * mm, 40 * mm])
        t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.5, line), ("LINEABOVE", (0, -1), (-1, -1), 0.8, ink),
                               ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
        slip = [
            Paragraph(school.name, st_(12, ink, True)),
            Paragraph("FEE REMINDER", st_(8.5, colors.HexColor("#1d5fe0"), True)),
            Spacer(1, 2 * mm),
            Paragraph(f"Dear parent of <b>{st.full_name}</b> ({klass}{', ' if klass else ''}Admission no. {st.admission_no}),", st_(9.5)),
            Paragraph("the following fees are due. Please pay at the school office, or online, "
                      + (f"by <b>{pay_by:%d %b %Y}</b>." if pay_by else "at the earliest."), st_(9.5)),
            Spacer(1, 2 * mm), t, Spacer(1, 2 * mm),
            Paragraph(f"Issued {today:%d %b %Y}. If you have paid already, please ignore this slip."
                      + (f" Queries: {school.phone_primary}." if school.phone_primary else ""), st_(8, muted)),
            Spacer(1, 4 * mm),
        ]
        if i % 3 != 2:
            slip.append(Paragraph("- " * 70, st_(6, line)))
            slip.append(Spacer(1, 4 * mm))
        story.append(KeepTogether(slip))
    if not story:
        story = [Paragraph("Nobody in this selection owes anything.", st_(11))]
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=12 * mm, bottomMargin=10 * mm,
                      title="Fee reminder slips").build(story)
    return buf.getvalue(), f"fee-reminder-slips-{today:%Y%m%d}.pdf", len(per)
