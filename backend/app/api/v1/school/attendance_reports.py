"""Story 7.3 — Attendance reports for School Admin / Principal.

JSON endpoints for the UI tables, plus paired `.csv` endpoints that stream
the same data as a download (acts as "Excel" export per the story spec —
Excel opens CSVs natively, no openpyxl dependency).
"""
from __future__ import annotations

import csv
import io
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal
from app.database import get_db
from app.schemas.attendance_report import (
    ClassSummaryRow,
    DailyAbsentRow,
    StudentMonthlyReport,
)
from app.services import attendance_report_service


router = APIRouter()


def _csv_response(filename: str, header: list[str], rows: list[list]) -> PlainTextResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- 1. Daily absent ---

@router.get(
    "/daily-absent",
    response_model=list[DailyAbsentRow],
    summary="Students marked absent on a given date",
)
def daily_absent(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    on_date: date = Query(..., alias="date"),
    class_id: Optional[int] = Query(None),
    section_id: Optional[int] = Query(None),
):
    rows = attendance_report_service.daily_absent(
        db,
        current_user.school_id,
        on_date,
        class_id=class_id,
        section_id=section_id,
    )
    return [DailyAbsentRow.model_validate(r) for r in rows]


@router.get(
    "/daily-absent.csv",
    response_class=PlainTextResponse,
    summary="CSV export of /daily-absent",
)
def daily_absent_csv(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    on_date: date = Query(..., alias="date"),
    class_id: Optional[int] = Query(None),
    section_id: Optional[int] = Query(None),
):
    data = attendance_report_service.daily_absent(
        db,
        current_user.school_id,
        on_date,
        class_id=class_id,
        section_id=section_id,
    )
    rows = [
        [
            r["class_name"],
            r["section_name"],
            r["roll_no"],
            r["admission_no"],
            r["full_name"],
            r.get("remark") or "",
        ]
        for r in data
    ]
    return _csv_response(
        f"daily_absent_{on_date.isoformat()}.csv",
        ["Class", "Section", "Roll #", "Admission #", "Student name", "Remark"],
        rows,
    )


# --- 2. Class summary ---

@router.get(
    "/class-summary",
    response_model=list[ClassSummaryRow],
    summary="Per-class/section attendance breakdown over a date range",
)
def class_summary(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    class_id: Optional[int] = Query(None),
):
    rows = attendance_report_service.class_summary(
        db, current_user.school_id, from_date, to_date, class_id=class_id
    )
    return [ClassSummaryRow.model_validate(r) for r in rows]


@router.get(
    "/class-summary.csv",
    response_class=PlainTextResponse,
    summary="CSV export of /class-summary",
)
def class_summary_csv(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    class_id: Optional[int] = Query(None),
):
    data = attendance_report_service.class_summary(
        db, current_user.school_id, from_date, to_date, class_id=class_id
    )
    rows = [
        [
            r["class_name"],
            r["section_name"],
            r["distinct_students"],
            r["distinct_days"],
            r["present"],
            r["absent"],
            r["late"],
            r["half_day"],
            r["attendance_pct"],
        ]
        for r in data
    ]
    return _csv_response(
        f"class_summary_{from_date.isoformat()}_to_{to_date.isoformat()}.csv",
        [
            "Class",
            "Section",
            "Students",
            "Days",
            "Present",
            "Absent",
            "Late",
            "Half day",
            "Attendance %",
        ],
        rows,
    )


# --- 3. Student monthly ---

@router.get(
    "/student-monthly",
    response_model=StudentMonthlyReport,
    summary="Per-student monthly attendance counts and % for one section",
)
def student_monthly(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    report = attendance_report_service.student_monthly(
        db, current_user.school_id, section_id, year, month
    )
    return StudentMonthlyReport.model_validate(report)


@router.get(
    "/student-monthly.csv",
    response_class=PlainTextResponse,
    summary="CSV export of /student-monthly",
)
def student_monthly_csv(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    report = attendance_report_service.student_monthly(
        db, current_user.school_id, section_id, year, month
    )
    rows = [
        [
            r["roll_no"],
            r["admission_no"],
            r["full_name"],
            r["present"],
            r["absent"],
            r["late"],
            r["half_day"],
            r["marked_days"],
            r["attendance_pct"],
        ]
        for r in report["rows"]
    ]
    label = (report["section_label"] or f"section-{section_id}").replace(" ", "_")
    return _csv_response(
        f"student_monthly_{label}_{year}-{month:02d}.csv",
        [
            "Roll #",
            "Admission #",
            "Student name",
            "Present",
            "Absent",
            "Late",
            "Half day",
            "Marked days",
            "Attendance %",
        ],
        rows,
    )
