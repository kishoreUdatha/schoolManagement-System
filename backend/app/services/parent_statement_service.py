"""Printable money papers for a family, from the school side.

The parent portal already prints its own receipts for online orders. The office
needs the same for any receipt it took (cash, cheque, UPI at the counter) and a
ledger across all of a parent's children, to hand over or post.
"""
from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import FeeStatus
from app.core.scoping import section_labels
from app.models.accounts import FeeCollection
from app.models.fee import FeeHead, StudentFee
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User

ZERO = Decimal("0")


def _children(db: Session, parent: User) -> dict[int, Student]:
    rows = db.execute(
        select(Student)
        .join(ParentStudent, ParentStudent.student_id == Student.id)
        .where(ParentStudent.parent_user_id == parent.id, Student.school_id == parent.school_id)
        .order_by(Student.full_name)
    ).scalars()
    return {s.id: s for s in rows}


def _rs(v: Decimal) -> str:
    return f"{v:,.2f}"


def _head(school: Optional[School], title: str, styles) -> list:
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, Spacer

    return [
        Paragraph(f"<b>{school.name if school else ''}</b>", styles["Title"]),
        Paragraph((school.address or "") if school else "", styles["Normal"]),
        Spacer(1, 0.3 * cm),
        Paragraph(f"<b>{title}</b>", styles["Heading2"]),
    ]


def receipt_pdf(db: Session, parent: User, collection_id: int) -> tuple[bytes, str]:
    """A counter receipt, for a payment made for one of this parent's children."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    kids = _children(db, parent)
    c = db.get(FeeCollection, collection_id)
    if not c or c.school_id != parent.school_id or c.student_id not in kids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found for this parent")
    sf = db.get(StudentFee, c.student_fee_id)
    head = db.get(FeeHead, sf.fee_head_id) if sf else None
    student = kids[c.student_id]
    who = db.get(User, c.collected_by_user_id) if c.collected_by_user_id else None
    school = db.get(School, parent.school_id)
    label = section_labels(db, {student.section_id}).get(student.section_id)

    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=1.2 * cm, rightMargin=1.2 * cm, topMargin=1.2 * cm)
    els = _head(school, "FEE RECEIPT", styles)
    meta = [
        ["Receipt no.", c.receipt_no],
        ["Date", c.collected_on.strftime("%d %b %Y")],
        ["Student", f"{student.full_name} ({student.admission_no})"],
        ["Class", label or ""],
        ["Parent", parent.full_name],
        ["Mode", c.mode.value.replace("_", " ").title() if c.mode else ""],
        ["Reference", c.reference or ""],
        ["Received by", who.full_name if who else ""],
    ]
    t = Table(meta, colWidths=[3.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey)]))
    els += [t, Spacer(1, 0.4 * cm)]
    rows = [
        ["Fee", "Period", "Amount (Rs.)"],
        [head.name if head else "Fee", sf.period if sf else "", _rs(c.amount)],
        ["", "Total", _rs(c.amount)],
    ]
    lines = Table(rows, colWidths=[6 * cm, 3 * cm, 3 * cm])
    lines.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F9FAFB")),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#E5E7EB")),
    ]))
    els.append(lines)
    if c.notes:
        els += [Spacer(1, 0.3 * cm), Paragraph(c.notes, styles["Italic"])]
    els += [Spacer(1, 0.6 * cm), Paragraph("This is a computer-generated receipt.", styles["Italic"])]
    doc.build(els)
    return buf.getvalue(), f"{c.receipt_no}.pdf"


def ledger_pdf(db: Session, parent: User, *, student_id: Optional[int] = None,
               frm: Optional[date] = None, to: Optional[date] = None) -> tuple[bytes, str]:
    """Charges, concessions and payments across the family, oldest first,
    with a running balance, and what the fee records say is still owed."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    kids = _children(db, parent)
    if student_id is not None:
        if student_id not in kids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That child is not linked to this parent")
        kids = {student_id: kids[student_id]}
    to = to or date.today()
    frm = frm or date(to.year - 5, 4, 1)
    if to < frm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="'to' is before 'from'")
    ids = list(kids) or [-1]

    entries: list[tuple[date, int, str, str, Decimal, Decimal]] = []  # date, order, student, text, debit, credit
    outstanding = ZERO
    for sf, h in db.execute(
        select(StudentFee, FeeHead).join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(StudentFee.student_id.in_(ids))
    ).all():
        if sf.status == FeeStatus.pending:
            outstanding += sf.amount_due - sf.amount_paid
        if not (frm <= sf.due_date <= to):
            continue
        name = kids[sf.student_id].full_name
        entries.append((sf.due_date, 0, name, f"{h.name} · {sf.period}", sf.amount_due, ZERO))
        if sf.status == FeeStatus.waived and sf.amount_due > sf.amount_paid:
            entries.append((sf.due_date, 1, name, f"Waived: {h.name} · {sf.period}", ZERO, sf.amount_due - sf.amount_paid))
    for c, sf, h in db.execute(
        select(FeeCollection, StudentFee, FeeHead)
        .join(StudentFee, FeeCollection.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(FeeCollection.student_id.in_(ids), FeeCollection.collected_on.between(frm, to))
    ).all():
        mode = c.mode.value.replace("_", " ") if c.mode else ""
        entries.append((c.collected_on, 2, kids[c.student_id].full_name,
                        f"Receipt {c.receipt_no} · {h.name} · {sf.period} · {mode}", ZERO, c.amount))
    entries.sort(key=lambda e: (e[0], e[1]))

    school = db.get(School, parent.school_id)
    styles = getSampleStyleSheet()
    small = styles["BodyText"].clone("small", fontSize=8, leading=10)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm)
    els = _head(school, "FEE LEDGER", styles)
    who = ", ".join(f"{s.full_name} ({s.admission_no})" for s in kids.values()) or "No children linked"
    els += [
        Paragraph(f"Parent: <b>{parent.full_name}</b>", styles["Normal"]),
        Paragraph(f"Children: {who}", styles["Normal"]),
        Paragraph(f"Period: {frm:%d %b %Y} to {to:%d %b %Y}", styles["Normal"]),
        Spacer(1, 0.4 * cm),
    ]
    rows = [["Date", "Student", "Description", "Charge", "Paid / waived", "Balance"]]
    bal = ZERO
    debit_total = credit_total = ZERO
    for d, _, name, text, debit, credit in entries:
        bal += debit - credit
        debit_total += debit
        credit_total += credit
        rows.append([d.strftime("%d %b %Y"), Paragraph(name, small), Paragraph(text, small),
                     _rs(debit) if debit else "", _rs(credit) if credit else "", _rs(bal)])
    if not entries:
        rows.append(["", "", "Nothing charged or paid in this period.", "", "", ""])
    rows.append(["", "", "Totals", _rs(debit_total), _rs(credit_total), _rs(bal)])
    t = Table(rows, colWidths=[2.2 * cm, 3.3 * cm, 6 * cm, 2 * cm, 2.3 * cm, 2.2 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (3, 0), (5, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#E5E7EB")),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    els += [t, Spacer(1, 0.5 * cm),
            Paragraph(f"<b>Outstanding today, from the fee records: Rs. {_rs(outstanding)}</b>", styles["Normal"]),
            Spacer(1, 0.3 * cm),
            Paragraph(f"Generated on {date.today():%d %b %Y}. Charges are dated by their due date; opening balances before this period are not carried in.", styles["Italic"])]
    doc.build(els)
    return buf.getvalue(), f"ledger-{parent.id}-{to:%Y%m%d}.pdf"
