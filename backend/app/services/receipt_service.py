"""A counter fee receipt, whole: the school, the student, who paid, every fee
on it, where the student's account stands after it, and its PDF.

A receipt is the fee_collections lines that share a receipt number (one
payment can cover several fees). The account summary is as at this receipt:
everything raised for the student (waived fees left out), what was paid
before it, and what remains after it.
"""
from __future__ import annotations

import io
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import FeeStatus
from app.models.accounts import FeeCollection
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.fee import FeeHead, StudentFee
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User

ZERO = Decimal("0")
_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
         "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
MODE_LABEL = {"cash": "Cash", "upi": "UPI", "card": "Card", "cheque": "Cheque", "bank_transfer": "Bank transfer",
              "online": "Online", "other": "Other"}


def _words(n: int) -> str:
    """Indian numbering: crore, lakh, thousand."""
    if n == 0:
        return "zero"

    def two(x: int) -> str:
        return _ONES[x] if x < 20 else (_TENS[x // 10] + ("-" + _ONES[x % 10] if x % 10 else ""))

    def three(x: int) -> str:
        h, r = divmod(x, 100)
        return " ".join(p for p in [f"{_ONES[h]} hundred" if h else "", two(r) if r else ""] if p)

    parts = []
    for size, name in ((10_000_000, "crore"), (100_000, "lakh"), (1000, "thousand")):
        q, n = divmod(n, size)
        if q:
            parts.append(f"{three(q) if q < 1000 else _words(q)} {name}")
    if n:
        parts.append(three(n))
    return " ".join(parts)


def rupees_in_words(amount: Decimal) -> str:
    rupees = int(amount)
    paise = int((amount - rupees) * 100)
    text = f"{_words(rupees)} rupees" + (f" and {_words(paise)} paise" if paise else "")
    return text[0].upper() + text[1:] + " only"


def _mask(phone: Optional[str]) -> Optional[str]:
    """The last five digits, the rest hidden: a receipt travels."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) < 6:
        return None
    return f"+91 ***** {digits[-5:]}" if len(digits) in (10, 12) else f"***** {digits[-5:]}"


def _payer(db: Session, student: Student) -> dict:
    """Who pays for the child: the primary guardian, else a linked parent login."""
    from app.models.foundation import Guardian, StudentGuardian
    from app.models.parent import ParentStudent

    g = db.execute(
        select(Guardian, StudentGuardian.relation)
        .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
        .where(StudentGuardian.student_id == student.id)
        .order_by(StudentGuardian.is_primary.desc(), StudentGuardian.id)
    ).first()
    if g:
        guardian, relation = g
        return {"name": guardian.full_name, "relation": relation.value.title(), "phone": _mask(guardian.phone),
                "email": guardian.email}
    p = db.execute(
        select(User, ParentStudent.relation).join(ParentStudent, ParentStudent.parent_user_id == User.id)
        .where(ParentStudent.student_id == student.id).order_by(ParentStudent.id)
    ).first()
    if p:
        user, relation = p
        return {"name": user.full_name, "relation": relation.value.title(), "phone": _mask(user.phone), "email": user.email}
    return {"name": None, "relation": None, "phone": None, "email": None}


def detail(db: Session, school_id: int, collection_id: int) -> dict:
    first = db.get(FeeCollection, collection_id)
    if not first or first.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    lines = db.execute(
        select(FeeCollection, StudentFee, FeeHead)
        .join(StudentFee, FeeCollection.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(FeeCollection.school_id == school_id, FeeCollection.receipt_no == first.receipt_no,
               FeeCollection.student_id == first.student_id)
        .order_by(FeeCollection.id)
    ).all()
    c0 = lines[0][0]
    total = sum((c.amount for c, _, _ in lines), ZERO)
    student = db.get(Student, c0.student_id)
    section = db.get(Section, student.section_id) if student.section_id else None
    klass = db.get(SchoolClass, section.class_id) if section else None
    year = db.get(AcademicYear, student.academic_year_id) if student.academic_year_id else None
    branch = None
    if section is not None and getattr(section, "branch_id", None):
        from app.models.rbac import Branch

        branch = db.get(Branch, section.branch_id)
    school = db.get(School, school_id)
    who = db.get(User, c0.collected_by_user_id) if c0.collected_by_user_id else None

    # the student's account as at this receipt
    demand = db.execute(
        select(func.coalesce(func.sum(StudentFee.amount_due), 0))
        .where(StudentFee.student_id == student.id, StudentFee.status != FeeStatus.waived)
    ).scalar_one()
    last_id = max(c.id for c, _, _ in lines)
    paid_to_date = db.execute(
        select(func.coalesce(func.sum(FeeCollection.amount), 0))
        .where(FeeCollection.student_id == student.id, FeeCollection.id <= last_id)
    ).scalar_one()
    demand, paid_to_date = Decimal(demand), Decimal(paid_to_date)

    return {
        "id": c0.id,
        "receipt_no": c0.receipt_no,
        "issued_at": c0.created_at,
        "collected_on": c0.collected_on,
        "amount": total,
        "amount_in_words": rupees_in_words(total),
        "mode": c0.mode.value,
        "mode_label": MODE_LABEL.get(c0.mode.value, c0.mode.value.title()),
        "reference": c0.reference,
        "collected_by_name": who.full_name if who else None,
        "school": {"name": school.name, "address": school.address, "logo_url": school.logo_url,
                   "phone": school.phone_primary, "email": school.email,
                   "campus": branch.name if branch else None},
        "student": {
            "id": student.id, "name": student.full_name, "admission_no": student.admission_no,
            "class_name": klass.name if klass else None, "section_name": section.name if section else None,
            "academic_year": year.name if year else None, "campus": branch.name if branch else None,
            "has_login": bool(student.user_id),
        },
        "payer": _payer(db, student),
        "lines": [
            {"collection_id": c.id, "fee_head_name": h.name, "period": sf.period,
             "fee_type": "Recurring" if h.is_recurring else "One-time", "amount": c.amount}
            for c, sf, h in lines
        ],
        "account": {
            "total_demand": demand,
            "previously_paid": paid_to_date - total,
            "paid_to_date": paid_to_date,
            "balance": max(demand - paid_to_date, ZERO),
        },
    }


def local_time(db: Session, school_id: int, at) -> str:
    """A moment in the school's own time zone, as a receipt prints it."""
    from zoneinfo import ZoneInfo

    school = db.get(School, school_id)
    try:
        tz = ZoneInfo(school.timezone or "Asia/Kolkata")
    except Exception:  # noqa: BLE001 - an unknown zone name falls back to India
        tz = ZoneInfo("Asia/Kolkata")
    return at.astimezone(tz).strftime("%d %b %Y, %I:%M %p")


def _period(p: str) -> str:
    if p == "ONETIME":
        return ""
    try:
        y, m = p.split("-")
        return " · " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(m) - 1] + f" {y}"
    except (ValueError, IndexError):
        return f" · {p}"


def _inr(v: Decimal) -> str:
    """₹1,07,000 — Indian grouping, no paise when whole."""
    v = Decimal(v)
    whole = int(v)
    s = str(abs(whole))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    paise = abs(v - whole)
    return ("-" if whole < 0 else "") + "Rs " + s + (f".{int(paise * 100):02d}" if paise else "")


def pdf(db: Session, school_id: int, collection_id: int) -> tuple[bytes, str]:
    """The receipt as an A4 page, laid out like the screen."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    d = detail(db, school_id, collection_id)
    blue = colors.HexColor("#1d5fe0")
    ink = colors.HexColor("#14213d")
    muted = colors.HexColor("#5b6b85")
    soft = colors.HexColor("#eaf1fd")
    line = colors.HexColor("#dbe4f2")
    st = lambda size=9.5, c=ink, bold=False, align=0: ParagraphStyle(  # noqa: E731
        "x", fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size, leading=size * 1.35, textColor=c, alignment=align)

    s, stu, pay, acc = d["school"], d["student"], d["payer"], d["account"]
    issued = local_time(db, school_id, d["issued_at"]) if d["issued_at"] else d["collected_on"].strftime("%d %b %Y")
    story = []
    band = Table([[Paragraph(s["name"], st(15, colors.white, True)), Paragraph("FEE PAYMENT RECEIPT", st(13, colors.white, True, 2))],
                  [Paragraph(" · ".join(x for x in [s.get("campus"), s.get("address")] if x) or "", st(8.5, colors.HexColor("#dbe7ff"))), ""]],
                 colWidths=[105 * mm, 75 * mm])
    band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), blue), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                              ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, -1), (-1, -1), 10)]))
    story += [band, Spacer(1, 6 * mm)]
    top = Table([[Paragraph("AMOUNT RECEIVED", st(8, muted, True)), Paragraph("Receipt No.", st(9, muted)), Paragraph(d["receipt_no"], st(9.5, ink, True))],
                 [Paragraph(_inr(d["amount"]), st(24, ink, True)), Paragraph("Issued", st(9, muted)), Paragraph(issued, st(9.5))],
                 ["", Paragraph("Status", st(9, muted)), Paragraph("Payment confirmed", st(9.5, colors.HexColor("#08845e"), True))]],
                colWidths=[80 * mm, 30 * mm, 70 * mm])
    top.setStyle(TableStyle([("SPAN", (0, 1), (0, 2)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, -1), (-1, -1), 0.6, line),
                             ("BOTTOMPADDING", (0, -1), (-1, -1), 8)]))
    story += [top, Spacer(1, 4 * mm)]

    def kv(rows):
        return [[Paragraph(k, st(9, muted)), Paragraph(v or "—", st(9.5))] for k, v in rows]

    left = [[Paragraph("STUDENT DETAILS", st(8, blue, True)), ""]] + kv([
        ("Student", stu["name"]), ("Admission No.", stu["admission_no"]),
        ("Class", " ".join(x for x in [stu["class_name"], stu["section_name"]] if x)),
        ("Academic year", stu["academic_year"]), ("Campus", stu["campus"])])
    right = [[Paragraph("PAYER DETAILS", st(8, blue, True)), ""]] + kv([
        ("Paid by", f"{pay['name']} ({pay['relation']})" if pay["name"] else None), ("Parent mobile", pay["phone"]),
        ("Payment mode", d["mode_label"]), ("Transaction reference", d["reference"]),
        ("Collected by", d["collected_by_name"])])
    lt, rt = Table(left, colWidths=[30 * mm, 58 * mm]), Table(right, colWidths=[36 * mm, 52 * mm])
    for t in (lt, rt):
        t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    both = Table([[lt, rt]], colWidths=[92 * mm, 88 * mm])
    both.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEAFTER", (0, 0), (0, 0), 0.6, line),
                              ("LEFTPADDING", (1, 0), (1, 0), 10), ("LINEBELOW", (0, 0), (-1, 0), 0.6, line), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [both, Spacer(1, 4 * mm), Paragraph("Payment breakdown", st(12, ink, True)), Spacer(1, 2 * mm)]

    rows = [[Paragraph("Description", st(9, ink, True)), Paragraph("Fee type", st(9, ink, True)), Paragraph("Amount", st(9, ink, True, 2))]]
    rows += [[Paragraph(f"{x['fee_head_name']}{_period(x['period'])}", st()), Paragraph(x["fee_type"], st()), Paragraph(_inr(x["amount"]), st(align=2))]
             for x in d["lines"]]
    rows += [[Paragraph("Total received", st(11, blue, True)), "", Paragraph(_inr(d["amount"]), st(12, blue, True, 2))]]
    br = Table(rows, colWidths=[95 * mm, 45 * mm, 40 * mm])
    br.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), soft), ("BACKGROUND", (0, -1), (-1, -1), soft),
                            ("LINEBELOW", (0, 0), (-1, -2), 0.4, line), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [br, Spacer(1, 2 * mm), Paragraph(f"Amount in words: <b>{d['amount_in_words']}.</b>", st(9, muted)), Spacer(1, 4 * mm)]

    summary = Table([[Paragraph(k, st(8.5, muted, align=1)) for k in ("Total fee demand", "Previously paid", "Paid to date", "Remaining balance")],
                     [Paragraph(_inr(acc[k]), st(12, blue if k == "balance" else ink, True, 1)) for k in ("total_demand", "previously_paid", "paid_to_date", "balance")]],
                    colWidths=[45 * mm] * 4)
    summary.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), soft), ("LINEAFTER", (0, 0), (2, -1), 0.6, line),
                                 ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [summary, Spacer(1, 6 * mm), Paragraph("Computer-generated receipt; no signature required.", st(8, muted))]

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                      title=f"Receipt {d['receipt_no']}").build(story)
    return buf.getvalue(), f"{d['receipt_no']}.pdf"


def send(db: Session, user: User, collection_id: int, to: str) -> dict:
    """Tell the student's parents, or the student, about the receipt: a
    notice in their app (and WhatsApp, where the school sends fee alerts there)."""
    from app.core import notify
    from app.core.enums import NoticeAudience, NotificationCategory

    d = detail(db, user.school_id, collection_id)
    student = db.get(Student, d["student"]["id"])
    title = f"Fee receipt {d['receipt_no']}"
    # the app shows ₹; only the PDF's built-in font lacks it
    rs = lambda v: _inr(v).replace("Rs ", "₹")  # noqa: E731
    body = (f"{rs(d['amount'])} received for {student.full_name} on {d['collected_on']:%d %b %Y} "
            f"({', '.join(x['fee_head_name'] for x in d['lines'])}). Balance now {rs(d['account']['balance'])}.")
    if to == "parent":
        n = notify.student_parents(db, student, title, body, category=NotificationCategory.fees)
        who = "parent"
    elif to == "student":
        if not student.user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This student has no login to send it to")
        n = notify._send(db, tenant_id=student.tenant_id, school_id=student.school_id, user_ids=[student.user_id],
                         title=title, body=body, audience=NoticeAudience.single_parent, student_id=student.id,
                         category=NotificationCategory.fees)
        who = "student"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Send to 'parent' or 'student'")
    if not n:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No parent login is linked to this student" if who == "parent" else "Could not send it")
    db.commit()
    return {"sent_to": who, "recipients": n}
