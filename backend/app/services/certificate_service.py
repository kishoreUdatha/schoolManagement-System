import io
import re
from datetime import date
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import (
    CertificateKind,
    CertificateStatus,
    FeeStatus,
    Gender,
    ParentRelation,
)
from app.core.scoping import get_school_student, require_linked_child, section_label
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.document import CertificateIssue, CertificateSequence, CertificateTemplate
from app.models.fee import StudentFee
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User
from app.schemas.document import (
    CertificateDecision,
    CertificateIssueCreate,
    TCFields,
    TemplateCreate,
    TemplateUpdate,
)


PLACEHOLDERS = {
    "student_name": "Student's full name",
    "admission_no": "Admission number",
    "class_section": "e.g. Class 5 A",
    "class_name": "e.g. Class 5",
    "dob": "Date of birth (12-05-2018)",
    "dob_words": "Date of birth in words",
    "he_she": "he / she",
    "his_her": "his / her",
    "son_daughter": "son / daughter",
    "father_name": "Father's name (from linked parents)",
    "mother_name": "Mother's name",
    "parent_name": "First linked parent/guardian",
    "academic_year": "Current academic year",
    "school_name": "School name",
    "school_address": "School address",
    "issue_date": "Date of issue",
    "purpose": "Purpose given when issuing",
    "date_of_leaving": "TC: date of leaving",
    "reason_for_leaving": "TC: reason",
    "last_class_studied": "TC: last class studied",
    "promoted_to": "TC: promoted to",
    "conduct": "TC / character: conduct",
    "fees_paid_up_to": "TC: fees paid up to",
}

DEFAULT_TEMPLATES = [
    {
        "kind": CertificateKind.bonafide,
        "name": "Bonafide certificate",
        "title": "BONAFIDE CERTIFICATE",
        "serial_prefix": "BON",
        "parent_can_request": True,
        "body": (
            "This is to certify that {student_name}, {son_daughter} of {parent_name}, bearing "
            "admission number {admission_no}, is a bonafide student of {school_name}, studying in "
            "{class_section} during the academic year {academic_year}.\n\n"
            "As per our records, {his_her} date of birth is {dob} ({dob_words}).\n\n"
            "This certificate is issued on request for the purpose of {purpose}."
        ),
    },
    {
        "kind": CertificateKind.study,
        "name": "Study certificate",
        "title": "STUDY CERTIFICATE",
        "serial_prefix": "STU",
        "parent_can_request": True,
        "body": (
            "This is to certify that {student_name} (Admission No. {admission_no}) is studying in "
            "{class_section} at {school_name} in the academic year {academic_year}.\n\n"
            "This certificate is issued for the purpose of {purpose}."
        ),
    },
    {
        "kind": CertificateKind.character,
        "name": "Character certificate",
        "title": "CHARACTER CERTIFICATE",
        "serial_prefix": "CHR",
        "parent_can_request": False,
        "body": (
            "This is to certify that {student_name}, {son_daughter} of {parent_name}, was a student "
            "of this school (Admission No. {admission_no}).\n\n"
            "During {his_her} stay, {he_she} bore a {conduct} moral character. To the best of our "
            "knowledge, nothing adverse is known against {his_her} character.\n\n"
            "We wish {his_her} every success in the future."
        ),
    },
    {
        "kind": CertificateKind.transfer,
        "name": "Transfer certificate",
        "title": "TRANSFER CERTIFICATE",
        "serial_prefix": "TC",
        "parent_can_request": False,
        "body": (
            "Certified that {student_name}, {son_daughter} of {father_name}, was a student of "
            "{school_name} with admission number {admission_no}. {he_sheCap} last studied in "
            "{last_class_studied} and left the school on {date_of_leaving} for the reason: "
            "{reason_for_leaving}.\n\n"
            "Date of birth as per admission register: {dob} ({dob_words}). Conduct: {conduct}. "
            "Fees paid up to: {fees_paid_up_to}. Promoted to: {promoted_to}."
        ),
    },
]

_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
         "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
         "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
        "nine": "ninth", "twelve": "twelfth"}


def _num_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("-" + _ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return _ONES[n // 100] + " hundred" + (" and " + _num_words(n % 100) if n % 100 else "")
    return _num_words(n // 1000) + " thousand" + (" " + _num_words(n % 1000) if n % 1000 else "")


def _ordinal(n: int) -> str:
    w = _num_words(n)
    head, _, last = w.rpartition("-")
    last_ord = _ORD.get(last, last[:-1] + "ieth" if last.endswith("y") else last + "th")
    return f"{head}-{last_ord}" if head else last_ord


def date_in_words(d: date) -> str:
    return f"{_ordinal(d.day)} {d.strftime('%B')} {_num_words(d.year)}".title()


# --- Templates ---

def ensure_defaults(db: Session, tenant_id: int, school_id: int) -> None:
    exists = db.execute(
        select(CertificateTemplate.id).where(CertificateTemplate.school_id == school_id)
    ).first()
    if exists:
        return
    for t in DEFAULT_TEMPLATES:
        db.add(CertificateTemplate(tenant_id=tenant_id, school_id=school_id, is_active=True, **t))
    db.commit()


def list_templates(db: Session, tenant_id: int, school_id: int) -> list[CertificateTemplate]:
    ensure_defaults(db, tenant_id, school_id)
    return list(
        db.execute(
            select(CertificateTemplate)
            .where(CertificateTemplate.school_id == school_id)
            .order_by(CertificateTemplate.is_active.desc(), CertificateTemplate.name)
        ).scalars()
    )


def _template(db: Session, template_id: int, school_id: int) -> CertificateTemplate:
    t = db.get(CertificateTemplate, template_id)
    if not t or t.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return t


def _check_placeholders(body: str) -> None:
    """Syntax check only: custom templates may use their own {names}, filled
    from the extra fields entered when issuing (preview lists any left blank)."""
    try:
        body.format_map(_Missing({}))
    except (ValueError, IndexError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template text has a stray brace or bad placeholder: {exc}",
        )
    if re.search(r"\{\s*\}|\{\d+\}", body):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Placeholders need a name, e.g. {student_name}"
        )


def create_template(db: Session, tenant_id: int, school_id: int, data: TemplateCreate) -> CertificateTemplate:
    _check_placeholders(data.body)
    t = CertificateTemplate(
        tenant_id=tenant_id,
        school_id=school_id,
        is_active=True,
        **{**data.model_dump(), "serial_prefix": data.serial_prefix.upper()},
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def update_template(db: Session, template_id: int, school_id: int, data: TemplateUpdate) -> CertificateTemplate:
    t = _template(db, template_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "body" in updates:
        _check_placeholders(updates["body"])
    if updates.get("serial_prefix"):
        updates["serial_prefix"] = updates["serial_prefix"].upper()
    for k, v in updates.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


# --- Rendering ---

def _context(db: Session, student: Student, purpose: Optional[str], fields: dict[str, Any], on: date) -> dict:
    school = db.get(School, student.school_id)
    year = db.get(AcademicYear, student.academic_year_id)
    sec = db.get(Section, student.section_id)
    cls = db.get(SchoolClass, sec.class_id) if sec else None
    parents = db.execute(
        select(ParentStudent.relation, User.full_name)
        .join(User, ParentStudent.parent_user_id == User.id)
        .where(ParentStudent.student_id == student.id)
        .order_by(ParentStudent.id)
    ).all()
    by_rel = {rel: name for rel, name in parents}
    female = student.gender == Gender.female
    ctx = {
        "student_name": student.full_name,
        "admission_no": student.admission_no,
        "class_section": section_label(db, student.section_id),
        "class_name": cls.name if cls else None,
        "dob": student.dob.strftime("%d-%m-%Y") if student.dob else None,
        "dob_words": date_in_words(student.dob) if student.dob else None,
        "he_she": "she" if female else "he",
        "he_sheCap": "She" if female else "He",
        "his_her": "her" if female else "his",
        "his_herCap": "Her" if female else "His",
        "son_daughter": "daughter" if female else "son",
        "father_name": by_rel.get(ParentRelation.father),
        "mother_name": by_rel.get(ParentRelation.mother),
        "parent_name": by_rel.get(ParentRelation.father) or (parents[0][1] if parents else None),
        "academic_year": year.name if year else None,
        "school_name": school.name if school else None,
        "school_address": school.address if school else None,
        "issue_date": on.strftime("%d-%m-%Y"),
        "purpose": purpose,
        "conduct": "good",
    }
    for k, v in (fields or {}).items():
        if isinstance(v, date):
            v = v.strftime("%d-%m-%Y")
        if v not in (None, ""):
            ctx[k] = str(v)
    return ctx


class _Missing(dict):
    def __init__(self, ctx: dict):
        super().__init__({k: v for k, v in ctx.items() if v not in (None, "")})
        self.missing: list[str] = []

    def __missing__(self, key: str) -> str:
        self.missing.append(key)
        return "________"


def render(template: CertificateTemplate, ctx: dict) -> tuple[str, list[str]]:
    m = _Missing(ctx)
    body = template.body.format_map(m)
    return body, sorted(set(m.missing))


def _fields_for(template: CertificateTemplate, fields: dict, tc: Optional[TCFields]) -> dict:
    if template.kind == CertificateKind.transfer:
        if tc is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer certificate details (date of leaving, reason, ...) are required",
            )
        return {**fields, **tc.model_dump(mode="json")}
    return dict(fields)


def preview(db: Session, school_id: int, data: CertificateIssueCreate) -> dict:
    t = _template(db, data.template_id, school_id)
    student = get_school_student(db, data.student_id, school_id)
    fields = {**data.fields, **(data.tc.model_dump(mode="json") if data.tc else {})}
    body, missing = render(t, _context(db, student, data.purpose, fields, date.today()))
    return {"title": t.title, "body": body, "missing": missing}


# --- Issuing ---

def _next_serial(db: Session, school_id: int, prefix: str, on: date) -> str:
    seq = db.execute(
        select(CertificateSequence)
        .where(
            CertificateSequence.school_id == school_id,
            CertificateSequence.prefix == prefix,
            CertificateSequence.year == on.year,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if seq is None:
        seq = CertificateSequence(school_id=school_id, prefix=prefix, year=on.year, last_value=0)
        db.add(seq)
        db.flush()
    seq.last_value += 1
    return f"{prefix}/{on.year}/{seq.last_value:04d}"


def _pending_dues(db: Session, student_id: int) -> int:
    return len(
        db.execute(
            select(StudentFee.id).where(
                StudentFee.student_id == student_id,
                StudentFee.status == FeeStatus.pending,
                StudentFee.amount_paid < StudentFee.amount_due,
            )
        ).all()
    )


def _issue(
    db: Session,
    c: CertificateIssue,
    template: CertificateTemplate,
    student: Student,
    actor_id: int,
    tc: Optional[TCFields],
) -> CertificateIssue:
    if not template.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template is inactive")
    today = date.today()
    if template.kind == CertificateKind.transfer:
        already = db.execute(
            select(CertificateIssue.serial_no).where(
                CertificateIssue.student_id == student.id,
                CertificateIssue.kind == CertificateKind.transfer,
                CertificateIssue.status == CertificateStatus.issued,
                CertificateIssue.id != c.id,
            )
        ).scalar_one_or_none()
        if already:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A transfer certificate ({already}) was already issued. Cancel it to issue a duplicate.",
            )
        dues = _pending_dues(db, student.id)
        if dues and not c.fields.get("allow_with_dues"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{dues} fee(s) are still pending. Clear them or tick 'issue despite dues'.",
            )
    body, _missing = render(template, _context(db, student, c.purpose, c.fields, today))
    c.serial_no = _next_serial(db, student.school_id, template.serial_prefix, today)
    c.title = template.title
    c.rendered_body = body
    c.issued_on = today
    c.issued_by_user_id = actor_id
    c.status = CertificateStatus.issued

    if template.kind == CertificateKind.transfer and tc and tc.deactivate_student:
        student.is_active = False
        from app.services import foundation_service  # local: avoids an import cycle

        foundation_service.sync_enrollment(db, student, note=f"Left: {tc.reason_for_leaving}")
        from app.models.transport import TransportAssignment  # local: optional module

        for a in db.execute(
            select(TransportAssignment).where(
                TransportAssignment.student_id == student.id, TransportAssignment.end_date.is_(None)
            )
        ).scalars():
            a.end_date = max(a.start_date, tc.date_of_leaving)
    db.commit()
    db.refresh(c)
    return c


def issue(db: Session, tenant_id: int, school_id: int, actor_id: int, data: CertificateIssueCreate) -> CertificateIssue:
    t = _template(db, data.template_id, school_id)
    student = get_school_student(db, data.student_id, school_id)
    fields = _fields_for(t, data.fields, data.tc)
    c = CertificateIssue(
        tenant_id=tenant_id,
        school_id=school_id,
        template_id=t.id,
        kind=t.kind,
        student_id=student.id,
        status=CertificateStatus.requested,
        purpose=(data.purpose or "").strip() or None,
        fields=fields,
    )
    db.add(c)
    db.flush()
    return _issue(db, c, t, student, actor_id, data.tc)


def _get(db: Session, cert_id: int, school_id: int) -> CertificateIssue:
    c = db.get(CertificateIssue, cert_id)
    if not c or c.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    return c


def get(db: Session, cert_id: int, school_id: int) -> CertificateIssue:
    return _get(db, cert_id, school_id)


def decide(db: Session, cert_id: int, school_id: int, actor_id: int, data: CertificateDecision) -> CertificateIssue:
    c = _get(db, cert_id, school_id)
    if c.status != CertificateStatus.requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Request is already {c.status.value}")
    if not data.approve:
        if not (data.remarks or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Give a reason for rejecting")
        c.status = CertificateStatus.rejected
        c.remarks = data.remarks.strip()
        c.issued_by_user_id = actor_id
        db.commit()
        db.refresh(c)
        return c
    t = _template(db, c.template_id, school_id) if c.template_id else None
    if t is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template was deleted")
    c.fields = _fields_for(t, {**c.fields, **data.fields}, data.tc)
    c.remarks = (data.remarks or "").strip() or None
    student = db.get(Student, c.student_id)
    return _issue(db, c, t, student, actor_id, data.tc)


def cancel(db: Session, cert_id: int, school_id: int, actor_id: int, reason: str) -> CertificateIssue:
    c = _get(db, cert_id, school_id)
    if c.status != CertificateStatus.issued:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only issued certificates can be cancelled")
    c.status = CertificateStatus.cancelled
    c.remarks = f"Cancelled: {reason.strip()}"
    db.commit()
    db.refresh(c)
    return c


def list_(
    db: Session,
    school_id: int,
    *,
    status_: Optional[CertificateStatus] = None,
    kind: Optional[CertificateKind] = None,
    student_id: Optional[int] = None,
) -> list[CertificateIssue]:
    stmt = select(CertificateIssue).where(CertificateIssue.school_id == school_id)
    if status_:
        stmt = stmt.where(CertificateIssue.status == status_)
    if kind:
        stmt = stmt.where(CertificateIssue.kind == kind)
    if student_id:
        stmt = stmt.where(CertificateIssue.student_id == student_id)
    return list(db.execute(stmt.order_by(CertificateIssue.created_at.desc()).limit(500)).scalars())


def to_read(db: Session, c: CertificateIssue) -> dict:
    s = db.get(Student, c.student_id)
    t = db.get(CertificateTemplate, c.template_id) if c.template_id else None
    issuer = db.get(User, c.issued_by_user_id) if c.issued_by_user_id else None
    requester = db.get(User, c.requested_by_user_id) if c.requested_by_user_id else None
    return {
        "id": c.id,
        "kind": c.kind,
        "template_id": c.template_id,
        "template_name": t.name if t else None,
        "student_id": c.student_id,
        "student_name": s.full_name if s else "",
        "admission_no": s.admission_no if s else "",
        "section_label": section_label(db, s.section_id) if s else None,
        "status": c.status,
        "purpose": c.purpose,
        "fields": c.fields or {},
        "serial_no": c.serial_no,
        "title": c.title,
        "rendered_body": c.rendered_body,
        "issued_on": c.issued_on,
        "issued_by_name": issuer.full_name if issuer else None,
        "requested_by_name": requester.full_name if requester else None,
        "remarks": c.remarks,
        "print_count": c.print_count,
        "delivery_preference": c.delivery_preference,
        "created_at": c.created_at,
    }


# --- Parent requests ---

def parent_templates(db: Session, parent_user_id: int, student_id: int) -> list[CertificateTemplate]:
    student = require_linked_child(db, parent_user_id, student_id)
    ensure_defaults(db, student.tenant_id, student.school_id)
    return list(
        db.execute(
            select(CertificateTemplate).where(
                CertificateTemplate.school_id == student.school_id,
                CertificateTemplate.parent_can_request.is_(True),
                CertificateTemplate.is_active.is_(True),
            )
        ).scalars()
    )


def parent_request(
    db: Session, parent: User, student_id: int, template_id: int, purpose: str, delivery_preference: str = "digital"
) -> CertificateIssue:
    student = require_linked_child(db, parent.id, student_id)
    t = _template(db, template_id, student.school_id)
    if not t.parent_can_request or not t.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This certificate can't be requested online")
    open_req = db.execute(
        select(CertificateIssue.id).where(
            CertificateIssue.student_id == student.id,
            CertificateIssue.template_id == t.id,
            CertificateIssue.status == CertificateStatus.requested,
        )
    ).first()
    if open_req:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already have a pending request for this certificate")
    c = CertificateIssue(
        tenant_id=student.tenant_id,
        school_id=student.school_id,
        template_id=t.id,
        kind=t.kind,
        student_id=student.id,
        status=CertificateStatus.requested,
        purpose=purpose.strip(),
        fields={},
        requested_by_user_id=parent.id,
        delivery_preference=delivery_preference,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def parent_list(db: Session, parent_user_id: int, student_id: int) -> list[CertificateIssue]:
    require_linked_child(db, parent_user_id, student_id)
    return list(
        db.execute(
            select(CertificateIssue)
            .where(
                CertificateIssue.student_id == student_id,
                # Parents see their requests and bonafide-type certificates, not TCs
                # the office issued (those are handed over in person).
                CertificateIssue.kind != CertificateKind.transfer,
            )
            .order_by(CertificateIssue.created_at.desc())
        ).scalars()
    )


def parent_get(db: Session, parent_user_id: int, student_id: int, cert_id: int) -> CertificateIssue:
    require_linked_child(db, parent_user_id, student_id)
    c = db.get(CertificateIssue, cert_id)
    if not c or c.student_id != student_id or c.kind == CertificateKind.transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    return c


# --- PDF ---

def pdf(db: Session, c: CertificateIssue, *, count_print: bool = True) -> tuple[bytes, str]:
    if c.status not in (CertificateStatus.issued, CertificateStatus.cancelled):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Certificate hasn't been issued yet")
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    school = db.get(School, c.school_id)
    student = db.get(Student, c.student_id)
    styles = getSampleStyleSheet()
    center = ParagraphStyle("c", parent=styles["Normal"], alignment=TA_CENTER, fontSize=10)
    body_style = ParagraphStyle("b", parent=styles["Normal"], alignment=TA_JUSTIFY, fontSize=12, leading=20)
    title_style = ParagraphStyle("t", parent=styles["Title"], fontSize=16, spaceBefore=6)

    buf = io.BytesIO()

    def watermark(canvas, _doc):
        if c.status == CertificateStatus.cancelled:
            canvas.saveState()
            canvas.setFont("Helvetica-Bold", 70)
            canvas.setFillColor(colors.Color(0.85, 0.1, 0.1, alpha=0.18))
            canvas.translate(A4[0] / 2, A4[1] / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "CANCELLED")
            canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2.2 * cm, rightMargin=2.2 * cm, topMargin=1.8 * cm)
    els = [
        Paragraph(f"<b>{(school.name if school else '').upper()}</b>", ParagraphStyle("h", parent=styles["Title"], fontSize=20)),
        Paragraph((school.address or "") if school else "", center),
        Paragraph(
            " · ".join(x for x in [school.phone_primary if school else None, school.email if school else None] if x),
            center,
        ),
        Spacer(1, 0.3 * cm),
        HRFlowable(width="100%", thickness=1.2, color=colors.black),
        Spacer(1, 0.3 * cm),
    ]
    meta = Table(
        [[f"No. {c.serial_no}", f"Date: {c.issued_on.strftime('%d-%m-%Y') if c.issued_on else ''}"]],
        colWidths=[8 * cm, 8.6 * cm],
    )
    meta.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 10)]))
    els += [meta, Spacer(1, 0.5 * cm), Paragraph(f"<u>{c.title or ''}</u>", title_style), Spacer(1, 0.6 * cm)]
    for para in (c.rendered_body or "").split("\n\n"):
        els += [Paragraph(para.replace("\n", "<br/>"), body_style), Spacer(1, 0.35 * cm)]

    if c.kind == CertificateKind.transfer:
        f = c.fields or {}
        rows = [
            ["Name of the student", student.full_name if student else ""],
            ["Admission number", student.admission_no if student else ""],
            ["Date of birth", student.dob.strftime("%d-%m-%Y") if student and student.dob else ""],
            ["Last class studied", f.get("last_class_studied") or ""],
            ["Promoted to", f.get("promoted_to") or ""],
            ["Date of leaving", f.get("date_of_leaving") or ""],
            ["Reason for leaving", f.get("reason_for_leaving") or ""],
            ["Conduct", f.get("conduct") or ""],
            ["Fees paid up to", f.get("fees_paid_up_to") or ""],
            ["Remarks", f.get("remarks") or ""],
        ]
        t = Table(rows, colWidths=[6 * cm, 10.6 * cm])
        t.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F9FAFB")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        els += [Spacer(1, 0.3 * cm), t]

    sig = Table([["", "Principal"]], colWidths=[9 * cm, 7.6 * cm])
    sig.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "CENTER"), ("LINEABOVE", (1, 0), (1, 0), 0.8, colors.black), ("TOPPADDING", (0, 0), (-1, -1), 4)]))
    els += [Spacer(1, 2.2 * cm), sig]
    if c.print_count >= 1 and count_print:
        els += [Spacer(1, 0.4 * cm), Paragraph(f"Duplicate copy #{c.print_count}", center)]
    doc.build(els, onFirstPage=watermark, onLaterPages=watermark)

    if count_print and c.status == CertificateStatus.issued:
        c.print_count += 1
        db.commit()
    safe = (c.serial_no or f"certificate-{c.id}").replace("/", "-")
    return buf.getvalue(), f"{safe}.pdf"
