import io
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import MarkStatus
from app.models.academic import SchoolClass, Section
from app.models.exam import Exam, ExamSubject
from app.models.mark import Mark
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.tenant import School
from app.services import grading_service


def _verify_parent_link(db: Session, parent_user_id: int, student_id: int) -> Student:
    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return student


def _published_exams_for_class(
    db: Session, school_id: int, class_id: int
) -> list[Exam]:
    return list(
        db.execute(
            select(Exam)
            .join(ExamSubject, ExamSubject.exam_id == Exam.id)
            .join(ClassSubject, ExamSubject.class_subject_id == ClassSubject.id)
            .where(
                Exam.school_id == school_id,
                Exam.is_published.is_(True),
                ClassSubject.class_id == class_id,
            )
            .distinct()
            .order_by(Exam.start_date.desc())
        ).scalars().all()
    )


def _build_result(
    db: Session, exam: Exam, student: Student
) -> dict:
    """Build the structured result for one student in one exam."""
    section = db.get(Section, student.section_id)
    cls = db.get(SchoolClass, section.class_id) if section else None

    # Find all papers in this exam that apply to the student's class
    paper_rows = db.execute(
        select(ExamSubject, ClassSubject, Subject)
        .join(ClassSubject, ExamSubject.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(
            ExamSubject.exam_id == exam.id,
            ClassSubject.class_id == (section.class_id if section else -1),
        )
        .order_by(ExamSubject.exam_date)
    ).all()

    # Marks for this student across the papers
    paper_ids = [p.id for p, _, _ in paper_rows]
    marks_by_paper = {}
    if paper_ids:
        marks = db.execute(
            select(Mark).where(
                Mark.student_id == student.id,
                Mark.exam_subject_id.in_(paper_ids),
            )
        ).scalars().all()
        marks_by_paper = {m.exam_subject_id: m for m in marks}

    subjects = []
    total_max = 0
    total_obtained = 0
    subjects_passed = 0
    subjects_failed = 0
    subjects_absent = 0
    subjects_exempt = 0
    subjects_pending = 0

    for paper, _, subj in paper_rows:
        m = marks_by_paper.get(paper.id)
        if m is None:
            subjects_pending += 1
            status_value = None
            marks_value = None
            grade = None
            is_pass = None
        else:
            status_value = m.status.value
            marks_value = m.marks_obtained
            grade = m.grade
            is_pass = m.is_pass
            if m.status == MarkStatus.scored:
                if m.is_pass:
                    subjects_passed += 1
                else:
                    subjects_failed += 1
                if m.marks_obtained is not None:
                    total_max += paper.max_marks
                    total_obtained += m.marks_obtained
            elif m.status == MarkStatus.absent:
                subjects_absent += 1
                total_max += paper.max_marks
                # 0 obtained
            else:  # exempt
                subjects_exempt += 1
                # Don't count toward total

        subjects.append(
            {
                "exam_paper_id": paper.id,
                "subject_name": subj.name,
                "subject_code": subj.code,
                "max_marks": paper.max_marks,
                "pass_marks": paper.pass_marks,
                "exam_date": paper.exam_date,
                "status": status_value,
                "marks_obtained": marks_value,
                "grade": grade,
                "is_pass": is_pass,
                "remark": m.remark if m else None,
            }
        )

    percentage = (total_obtained / total_max * 100) if total_max > 0 else 0.0
    scale = grading_service.scale_for_exam(db, exam)
    overall_grade, overall_points, _ = (
        grading_service.grade_for(scale, percentage) if total_max > 0 else ("—", None, None)
    )
    overall_pass = (
        subjects_failed == 0
        and subjects_absent == 0
        and subjects_pending == 0
        and (subjects_passed + subjects_exempt) > 0
    )

    summary = {
        "total_max": total_max,
        "total_obtained": total_obtained,
        "percentage": round(percentage, 2),
        "overall_grade": overall_grade,
        "overall_points": float(overall_points) if overall_points is not None else None,
        "is_pass": overall_pass,
        "subjects_total": len(subjects),
        "subjects_passed": subjects_passed,
        "subjects_failed": subjects_failed,
        "subjects_absent": subjects_absent,
        "subjects_exempt": subjects_exempt,
        "subjects_pending": subjects_pending,
    }

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "exam_kind": exam.kind.value,
        "grade_scale": (
            {"name": scale.name,
             "bands": [{"grade": b.grade, "min_percent": float(b.min_percent), "max_percent": float(b.max_percent),
                        "points": float(b.points) if b.points is not None else None, "remark": b.remark}
                       for b in sorted(scale.bands, key=lambda b: b.min_percent, reverse=True)]}
            if scale else None
        ),
        "start_date": exam.start_date,
        "end_date": exam.end_date,
        "is_published": exam.is_published,
        "published_at": exam.published_at,
        "student_id": student.id,
        "student_name": student.full_name,
        "student_admission_no": student.admission_no,
        "student_roll_no": student.roll_no,
        "class_name": cls.name if cls else None,
        "section_name": section.name if section else None,
        "subjects": subjects,
        "summary": summary,
    }


# ---------- overrides ----------


def _override(db: Session, exam_id: int, student_id: int):
    from app.models.result_override import ExamResultOverride

    return db.execute(
        select(ExamResultOverride).where(
            ExamResultOverride.exam_id == exam_id, ExamResultOverride.student_id == student_id
        )
    ).scalar_one_or_none()


def apply_override(db: Session, result: dict, *, for_parent: bool) -> dict:
    """Fold the school's decision into a computed result. A withheld result
    shows the note instead of the marks in the parent portal; staff still see
    everything, flagged."""
    from app.core.enums import ResultStatus

    o = _override(db, result["exam_id"], result["student_id"])
    result["result_status"] = (o.result_status.value if o else ResultStatus.normal.value)
    result["result_version"] = o.version_no if o else 1
    result["override_reason"] = o.reason if o else None
    result["parent_note"] = o.parent_note if o else None
    if not o:
        return result
    if o.result_status == ResultStatus.pass_by_grace:
        result["summary"]["is_pass"] = True
    elif o.result_status == ResultStatus.failed:
        result["summary"]["is_pass"] = False
    elif o.result_status == ResultStatus.withheld and for_parent:
        result["subjects"] = []
        result["summary"] = {
            **result["summary"], "total_obtained": 0, "percentage": 0.0, "overall_grade": "-",
            "overall_points": None, "is_pass": False,
        }
    return result


def list_exams_for_child(
    db: Session, parent_user_id: int, student_id: int
) -> list[dict]:
    student = _verify_parent_link(db, parent_user_id, student_id)
    return list_published_for_student(db, student)


def list_published_for_student(db: Session, student: Student) -> list[dict]:
    """Published results for one child, with the school's decision applied.

    Shared by the parent portal and the child's own. Whoever is asking, a
    withheld result has to stay withheld — a family that cannot see a mark at
    home should not be able to see it by borrowing the child's login.
    """
    section = db.get(Section, student.section_id)
    if not section:
        return []
    exams = _published_exams_for_class(db, student.school_id, section.class_id)
    out = []
    for exam in exams:
        full = apply_override(db, _build_result(db, exam, student), for_parent=True)
        out.append(
            {
                "exam_id": exam.id,
                "exam_name": exam.name,
                "exam_kind": exam.kind.value,
                "start_date": exam.start_date,
                "end_date": exam.end_date,
                "published_at": exam.published_at,
                "summary": full["summary"],
                "result_status": full["result_status"],
                "parent_note": full["parent_note"],
            }
        )
    return out


def get_child_exam_result(
    db: Session, parent_user_id: int, student_id: int, exam_id: int
) -> dict:
    student = _verify_parent_link(db, parent_user_id, student_id)
    return get_published_result_for_student(db, student, exam_id)


def get_published_result_for_student(db: Session, student: Student, exam_id: int) -> dict:
    """One published result for one child, as the family sees it."""
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != student.school_id or not exam.is_published:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found or not published",
        )
    result = apply_override(db, _build_result(db, exam, student), for_parent=True)
    return add_report_card_extras(db, exam, student, result)


def build_student_result_for_admin(
    db: Session, school_id: int, student_id: int, exam_id: int
) -> dict:
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found"
        )
    # plain result: rank/remarks are added only for report cards
    return apply_override(db, _build_result(db, exam, student), for_parent=False)


# ---------- PDF generation ----------

def add_report_card_extras(db: Session, exam: Exam, student: Student, result: dict, ranks=None) -> dict:
    """Attendance, rank and remarks, per the school's report card settings."""
    from app.models.attendance import StudentAttendance
    from app.core.enums import AttendanceStatus

    cfg = grading_service.settings(db, exam.school_id)
    if cfg.show_attendance:
        rows = db.execute(
            select(StudentAttendance.status, func.count())
            .where(StudentAttendance.student_id == student.id,
                   StudentAttendance.date.between(exam.start_date.replace(month=1, day=1), exam.end_date))
            .group_by(StudentAttendance.status)
        ).all()
        total = sum(n for _, n in rows)
        present = sum(n for st, n in rows if st != AttendanceStatus.absent)
        result["attendance_percent"] = grading_service.percent(present, total)
    if cfg.show_rank and student.section_id:
        ranks = grading_service.rank_map(db, student.section_id, exam.id) if ranks is None else ranks
        result["rank"] = ranks.get(student.id)
        result["class_size"] = len(ranks)
    if cfg.show_remarks:
        r = grading_service.remarks_for(db, exam.id, [student.id]).get(student.id)
        if r:
            result["teacher_remark"] = r.teacher_remark
            result["principal_remark"] = r.principal_remark
    if not cfg.show_grade_scale:
        result["grade_scale"] = None
    result["_settings"] = cfg
    return result


def _draw_report_card(elements: list, result: dict, school: School) -> None:
    """Append one student's report card pages to a Platypus 'elements' list."""
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1", parent=styles["Heading1"], alignment=1, fontSize=18, spaceAfter=6
    )
    sub = ParagraphStyle(
        "sub", parent=styles["Normal"], alignment=1, fontSize=11, textColor=colors.grey
    )
    sect = ParagraphStyle(
        "sect",
        parent=styles["Heading3"],
        fontSize=11,
        spaceBefore=10,
        spaceAfter=4,
    )
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9)

    # Header
    elements.append(Paragraph(school.name.upper() if school else "SCHOOL", h1))
    if school and school.address:
        elements.append(Paragraph(school.address, sub))
    elements.append(Paragraph(f"<b>REPORT CARD — {result['exam_name'].upper()}</b>", sub))
    elements.append(Spacer(1, 0.4 * cm))

    # Student info table
    info_data = [
        ["Student name:", result["student_name"], "Admission #:", result["student_admission_no"]],
        ["Class / Section:", f"{result['class_name']} {result['section_name']}", "Roll #:", str(result["student_roll_no"])],
        ["Exam dates:", f"{result['start_date']} → {result['end_date']}", "Type:", result["exam_kind"].replace("_", " ")],
    ]
    info_tbl = Table(info_data, colWidths=[3.2 * cm, 6 * cm, 2.6 * cm, 4 * cm])
    info_tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
                ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(info_tbl)
    elements.append(Spacer(1, 0.3 * cm))

    # Subjects table
    elements.append(Paragraph("Subject-wise results", sect))
    rows = [["Subject", "Max", "Obtained", "Grade", "Pass/Fail", "Remark"]]
    for s in result["subjects"]:
        status = s.get("status")
        if status == "absent":
            obtained = "Absent"
        elif status == "exempt":
            obtained = "Exempt"
        elif s.get("marks_obtained") is None:
            obtained = "—"
        else:
            obtained = str(s["marks_obtained"])
        pf = (
            "Pass" if s.get("is_pass") is True else "Fail" if s.get("is_pass") is False else "—"
        )
        rows.append(
            [
                f"{s['subject_name']} ({s['subject_code']})",
                str(s["max_marks"]),
                obtained,
                s.get("grade") or "—",
                pf,
                (s.get("remark") or "")[:40],
            ]
        )

    subj_tbl = Table(
        rows,
        colWidths=[5.5 * cm, 1.5 * cm, 2.2 * cm, 1.6 * cm, 1.8 * cm, 3.4 * cm],
    )
    subj_tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D4ED8")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
                ("ALIGN", (1, 1), (4, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elements.append(subj_tbl)
    elements.append(Spacer(1, 0.4 * cm))

    # Summary
    summary = result["summary"]
    summary_data = [
        ["Total obtained:", f"{summary['total_obtained']} / {summary['total_max']}", "Percentage:", f"{summary['percentage']}%"],
        ["Overall grade:", summary["overall_grade"], "Result:", "PASS" if summary["is_pass"] else "FAIL"],
        [
            "Subjects passed:",
            f"{summary['subjects_passed']} of {summary['subjects_total']}",
            "Failed/Absent:",
            f"{summary['subjects_failed']}/{summary['subjects_absent']}",
        ],
    ]
    sum_tbl = Table(summary_data, colWidths=[3.2 * cm, 4.5 * cm, 2.6 * cm, 3 * cm])
    sum_tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
                ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
                ("FONTNAME", (1, 1), (1, 1), "Helvetica-Bold"),
                ("FONTNAME", (3, 1), (3, 1), "Helvetica-Bold"),
                (
                    "TEXTCOLOR",
                    (3, 1),
                    (3, 1),
                    colors.green if summary["is_pass"] else colors.red,
                ),
                ("BOX", (0, 0), (-1, -1), 0.4, colors.lightgrey),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(sum_tbl)

    extras = []
    if result.get("attendance_percent") is not None:
        extras.append(["Attendance:", f"{result['attendance_percent']}%"])
    if result.get("rank"):
        extras.append(["Rank in class:", f"{result['rank']} of {result.get('class_size') or '—'}"])
    if summary.get("overall_points") is not None:
        extras.append(["Grade points:", str(summary["overall_points"])])
    if extras:
        ex_tbl = Table(extras, colWidths=[3.2 * cm, 4.5 * cm])
        ex_tbl.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(Spacer(1, 0.25 * cm))
        elements.append(ex_tbl)

    for label, key in (("Class teacher's remark", "teacher_remark"), ("Principal's remark", "principal_remark")):
        if result.get(key):
            elements.append(Paragraph(label, sect))
            elements.append(Paragraph(result[key], small))

    scale = result.get("grade_scale")
    if scale and scale.get("bands"):
        elements.append(Paragraph(f"Grading scale — {scale['name']}", sect))
        legend = [["Grade", "Marks %", "Points", "Meaning"]] + [
            [b["grade"], f"{b['min_percent']:g}–{b['max_percent']:g}",
             "" if b.get("points") is None else f"{b['points']:g}", b.get("remark") or ""]
            for b in scale["bands"]
        ]
        lg = Table(legend, colWidths=[1.6 * cm, 2.6 * cm, 1.8 * cm, 6 * cm])
        lg.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("ALIGN", (0, 1), (2, -1), "CENTER"),
        ]))
        elements.append(lg)

    elements.append(Spacer(1, 1.0 * cm))

    # Signature line
    sig_data = [
        ["Class teacher", "", "Principal"],
        ["_________________", "", "_________________"],
    ]
    sig_tbl = Table(sig_data, colWidths=[5 * cm, 4 * cm, 5 * cm])
    sig_tbl.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.grey),
            ]
        )
    )
    elements.append(sig_tbl)


def generate_report_card_pdf(
    db: Session, results: list[dict], school_id: int
) -> bytes:
    """Generate a single PDF with one page per result."""
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import PageBreak, SimpleDocTemplate

    school = db.get(School, school_id)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40,
        title=f"Report Card",
        author=school.name if school else "School",
    )

    elements: list = []
    for i, result in enumerate(results):
        _draw_report_card(elements, result, school)
        if i < len(results) - 1:
            elements.append(PageBreak())

    doc.build(elements)
    return buf.getvalue()


def section_report_cards(
    db: Session, school_id: int, exam_id: int, section_id: int
) -> tuple[bytes, str]:
    """Bulk PDF for all students in a section for a given exam."""
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found"
        )
    section = db.get(Section, section_id)
    if not section or section.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )

    students = db.execute(
        select(Student)
        .where(
            Student.section_id == section_id,
            Student.is_active.is_(True),
        )
        .order_by(Student.roll_no, Student.full_name)
    ).scalars().all()
    if not students:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active students in this section",
        )

    cfg = grading_service.settings(db, school_id)
    ranks = grading_service.rank_map(db, section_id, exam.id) if cfg.show_rank else {}
    results = [
        add_report_card_extras(db, exam, s, _build_result(db, exam, s), ranks=ranks)
        for s in students
    ]
    pdf_bytes = generate_report_card_pdf(db, results, school_id)
    filename = f"report-cards-{exam.name.replace(' ', '_')}-section-{section.id}.pdf"
    return pdf_bytes, filename
