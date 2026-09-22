"""Reports and analytics.

Every route here reads. There is no POST, PUT or DELETE in this file and
there should never be one — a report that can change the thing it reports on
is a report nobody can trust.

Who may look is decided per report rather than in one blanket rule: the
school-wide numbers are for the admin and the principal, the money ones open
up to the accountant, and none of them go to a teacher or a parent, because
every row is about somebody else's child or somebody else's pay.
"""
from __future__ import annotations

import csv
import io
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.deps import AssetKeeper, LibraryReports, SchoolAdminOrAccountant, SchoolAdminOrPrincipal
from app.database import get_db
from app.schemas.analytics import (
    ChronicAbsence,
    Demographics,
    DuesAgeing,
    ExamAnalysis,
    FeeCollectionReport,
    InventoryValuation,
    LibraryUsage,
    NotificationReport,
    Overview,
    PayrollByDepartment,
    StaffAttendanceSummary,
    Strength,
    TeacherActivity,
    TransportUtilisation,
)
from app.services import analytics_service


router = APIRouter()


def _csv(filename: str, header: list[str], rows: list[list]) -> PlainTextResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- the school at a glance ----------


@router.get("/overview", response_model=Overview)
def overview(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    months: int = Query(6, ge=1, le=24),
):
    """Heads, attendance and money for the last few months, in one call."""
    return analytics_service.overview(db, user.school_id, months=months)


# ---------- who is in the school ----------


@router.get("/strength", response_model=Strength)
def strength(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = None,
):
    return analytics_service.strength(db, user.school_id, academic_year_id)


@router.get("/strength.csv", response_class=PlainTextResponse)
def strength_csv(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = None,
):
    data = analytics_service.strength(db, user.school_id, academic_year_id)
    return _csv(
        "strength.csv",
        ["Class", "Section", "Students", "Boys", "Girls", "Capacity", "Fill %"],
        [[s["class_name"], s["section_name"], s["students"], s["boys"], s["girls"],
          s["capacity"], s["fill_percent"]] for s in data["sections"]],
    )


@router.get("/demographics", response_model=Demographics)
def demographics(user: SchoolAdminOrPrincipal, db: Annotated[Session, Depends(get_db)]):
    return analytics_service.demographics(db, user.school_id)


# ---------- attendance ----------


@router.get("/chronic-absence", response_model=ChronicAbsence)
def chronic_absence(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    below: float = Query(75.0, ge=0, le=100),
    min_days: int = Query(10, ge=1),
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    return analytics_service.chronic_absence(
        db, user.school_id, below=below, frm=frm, to=to, min_days=min_days
    )


@router.get("/chronic-absence.csv", response_class=PlainTextResponse)
def chronic_absence_csv(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    below: float = Query(75.0, ge=0, le=100),
    min_days: int = Query(10, ge=1),
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    data = analytics_service.chronic_absence(
        db, user.school_id, below=below, frm=frm, to=to, min_days=min_days
    )
    return _csv(
        "chronic-absence.csv",
        ["Admission no", "Student", "Section", "Marked", "Present", "Absent", "Attendance %"],
        [[s["admission_no"], s["student_name"], s["section_label"] or "", s["marked_days"],
          s["present_days"], s["absent_days"], s["percent"]] for s in data["students"]],
    )


# ---------- exams and teaching ----------


@router.get("/exams/{exam_id}", response_model=ExamAnalysis)
def exam_analysis(
    exam_id: int,
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
):
    return analytics_service.exam_analysis(db, user.school_id, exam_id)


@router.get("/teacher-activity", response_model=TeacherActivity)
def teacher_activity(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(90, ge=7, le=365),
):
    """Counts of work done, per teacher. Not a ranking — see the service."""
    return analytics_service.teacher_activity(db, user.school_id, days=days)


# ---------- money ----------


@router.get("/fee-collection", response_model=FeeCollectionReport)
def fee_collection(
    user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    return analytics_service.fee_collection(db, user.school_id, frm=frm, to=to)


@router.get("/fee-collection.csv", response_class=PlainTextResponse)
def fee_collection_csv(
    user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    data = analytics_service.fee_collection(db, user.school_id, frm=frm, to=to)
    rows = [["Fee head", r["label"], r["amount"]] for r in data["by_head"]]
    rows += [["Class", r["label"], r["amount"]] for r in data["by_class"]]
    rows += [["Mode", r["label"], r["amount"]] for r in data["by_mode"]]
    return _csv("fee-collection.csv", ["Grouping", "Name", "Amount"], rows)


@router.get("/payroll-by-department", response_model=PayrollByDepartment,
            summary="One payroll run (the latest by default), by department")
def payroll_by_department(user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)],
                          run_id: Optional[int] = None):
    return analytics_service.payroll_by_department(db, user.school_id, run_id)


@router.get("/dues-ageing", response_model=DuesAgeing)
def dues_ageing(user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)]):
    return analytics_service.dues_ageing(db, user.school_id)


@router.get("/dues-ageing.csv", response_class=PlainTextResponse)
def dues_ageing_csv(user: SchoolAdminOrAccountant, db: Annotated[Session, Depends(get_db)]):
    data = analytics_service.dues_ageing(db, user.school_id)
    return _csv(
        "dues-ageing.csv",
        ["Admission no", "Student", "Section", "Owed", "Bills", "Oldest (days)"],
        [[d["admission_no"], d["student_name"], d["section_label"] or "", d["owed"],
          d["items"], d["oldest_days"]] for d in data["defaulters"]],
    )


# ---------- staff and the operational modules ----------


@router.get("/staff-attendance", response_model=StaffAttendanceSummary)
def staff_attendance(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    return analytics_service.staff_attendance_summary(db, user.school_id, year, month)


@router.get("/transport", response_model=TransportUtilisation)
def transport(user: SchoolAdminOrPrincipal, db: Annotated[Session, Depends(get_db)]):
    return analytics_service.transport_utilisation(db, user.school_id)


@router.get("/library", response_model=LibraryUsage)
def library(
    user: LibraryReports,
    db: Annotated[Session, Depends(get_db)],
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    return analytics_service.library_usage(db, user.school_id, frm=frm, to=to)


@router.get("/inventory", response_model=InventoryValuation)
def inventory(user: AssetKeeper, db: Annotated[Session, Depends(get_db)]):
    return analytics_service.inventory_valuation(db, user.school_id)


@router.get("/notifications", response_model=NotificationReport)
def notifications(
    user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    return analytics_service.notification_report(db, user.school_id, frm=frm, to=to)
