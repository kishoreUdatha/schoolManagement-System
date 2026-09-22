"""Shapes for the report endpoints.

Every report is read-only, so there is no Create/Update pair here — only what
goes out. The rows are deliberately flat: a chart library wants a list of
objects with the same keys, not a nested tree it has to walk.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class LabelCount(BaseModel):
    """A slice of a pie: a name and how many."""
    label: str
    count: int


class LabelAmount(BaseModel):
    """A slice of a pie, in money."""
    label: str
    amount: Decimal


# ---------- overview ----------


class MonthAttendance(BaseModel):
    month: str
    present: int
    absent: int
    late: int
    half_day: int
    percent: float


class MonthMoney(BaseModel):
    month: str
    collected: Decimal
    raised: Decimal


class Overview(BaseModel):
    # mean score over the current year's published exams; None before any
    academic_average: Optional[float] = None
    academic_average_marks: int = 0
    academic_average_exams: int = 0
    students: int
    staff: int
    attendance_this_month: float
    collected_this_month: Decimal
    outstanding: Decimal
    attendance_by_month: list[MonthAttendance]
    money_by_month: list[MonthMoney]


# ---------- strength and demographics ----------


class StrengthSection(BaseModel):
    class_id: int
    class_name: str
    section_id: int
    section_name: str
    students: int
    boys: int
    girls: int
    capacity: int
    fill_percent: float


class StrengthClass(BaseModel):
    class_id: int
    class_name: str
    students: int
    boys: int
    girls: int
    capacity: int
    sections: int


class StrengthYear(BaseModel):
    academic_year_id: int
    academic_year_name: str
    students: int


class Strength(BaseModel):
    academic_year_id: Optional[int] = None
    total_students: int
    total_capacity: int
    fill_percent: float
    classes: list[StrengthClass]
    sections: list[StrengthSection]
    history: list[StrengthYear]


class DemographicsRecorded(BaseModel):
    """How much of the data is actually filled in — a demographic chart built
    on half-empty fields is worth knowing about before it is quoted."""
    dob: int
    gender: int
    blood_group: int


class Demographics(BaseModel):
    total: int
    gender: list[LabelCount]
    blood_group: list[LabelCount]
    age: list[LabelCount]
    recorded: DemographicsRecorded


# ---------- attendance ----------


class ChronicAbsenceRow(BaseModel):
    student_id: int
    admission_no: str
    student_name: str
    section_label: Optional[str] = None
    marked_days: int
    present_days: int
    absent_days: int
    percent: float
    # the latest call home about this child, if any (SCR-118)
    last_follow_up_on: Optional[date] = None
    last_follow_up_method: Optional[str] = None
    next_follow_up_on: Optional[date] = None
    follow_up_due: bool = False


class ChronicAbsence(BaseModel):
    from_date: date
    to_date: date
    below: float
    min_days: int
    count: int
    students: list[ChronicAbsenceRow]


# ---------- exams ----------


class ExamSubjectRow(BaseModel):
    subject_id: int
    subject_name: str
    subject_code: Optional[str] = None
    max_marks: int
    entered: int
    passed: int
    absent: int
    highest: int
    lowest: Optional[int] = None
    average: float
    average_percent: float
    pass_percent: float


class ExamTopper(BaseModel):
    student_id: int
    student_name: str
    admission_no: str
    section_label: Optional[str] = None
    obtained: int
    max: int
    percent: float


class GradeCount(BaseModel):
    grade: str
    count: int


class ExamClassRow(BaseModel):
    """One class section's result in the exam, student by student."""
    section_label: str
    appeared: int
    passed: int
    failed: int
    pass_percent: float
    average_percent: float
    top_percent: float
    needs_support: int


class ExamAnalysis(BaseModel):
    exam_id: int
    exam_name: str
    is_published: bool
    marks_entered: int
    pass_percent: float
    grades: list[GradeCount]
    subjects: list[ExamSubjectRow]
    toppers: list[ExamTopper]
    struggling: list[ExamSubjectRow]
    classes: list[ExamClassRow] = []


# ---------- teachers ----------


class TeacherActivityRow(BaseModel):
    user_id: int
    name: str
    role: str
    subjects: int
    class_teacher_of: int
    syllabus_topics: int
    syllabus_covered: int
    syllabus_percent: float
    marks_entered: int
    homework_set: int
    days_attendance_marked: int


class TeacherActivity(BaseModel):
    days: int
    since: date
    teachers: list[TeacherActivityRow]


# ---------- money ----------


class MonthAmount(BaseModel):
    month: str
    amount: Decimal


class HeadBilled(BaseModel):
    """One fee head: billed (falling due in the window) against paid."""
    label: str
    expected: Decimal
    paid: Decimal
    outstanding: Decimal
    collection_rate: float
    bills: int
    # receipts recorded against this head in the window
    receipts: int = 0


class FeeCollectionReport(BaseModel):
    from_date: date
    to_date: date
    receipts: int
    total: Decimal
    by_head: list[LabelAmount]
    by_class: list[LabelAmount]
    by_mode: list[LabelAmount]
    by_month: list[MonthAmount]
    billed_by_head: list[HeadBilled] = []


class DefaulterRow(BaseModel):
    student_id: int
    student_name: str
    admission_no: str
    section_label: Optional[str] = None
    owed: Decimal
    items: int
    oldest_days: int


class DuesAgeing(BaseModel):
    as_of: date
    total: Decimal
    students_owing: int
    buckets: list[LabelAmount]
    defaulters: list[DefaulterRow]


# ---------- staff, transport, library, stock, notices ----------


class StaffAttendanceRow(BaseModel):
    user_id: int
    name: str
    role: str
    present: int
    late: int
    absent: int
    on_leave: int
    sick: int
    holiday: int
    marked: int
    percent: float


class StaffAttendanceSummary(BaseModel):
    year: int
    month: int
    from_date: date
    to_date: date
    working_days: int
    staff: list[StaffAttendanceRow]


class RouteUtilisation(BaseModel):
    route_id: int
    route_name: str
    vehicle: Optional[str] = None
    capacity: int
    riders: int
    free_seats: int
    utilisation: float
    over_capacity: bool
    # today's morning run: None when no trip sheet was opened today
    boarded_today: Optional[int] = None
    trip_status_today: Optional[str] = None
    # from logged odometer readings, else stop-to-stop map distance
    distance_km: Optional[float] = None


class TransportUtilisation(BaseModel):
    routes: list[RouteUtilisation]
    total_capacity: int
    total_riders: int
    utilisation: float
    over_capacity: list[RouteUtilisation]


class LibraryMonth(BaseModel):
    month: str
    issued: int
    returned: int


class LibraryTitle(BaseModel):
    book_id: int
    title: str
    times: int


class LibraryCategory(BaseModel):
    category: str
    members: int
    issues: int
    returns: int
    overdue: int
    most_borrowed: Optional[str] = None


class LibraryUsage(BaseModel):
    from_date: date
    to_date: date
    issued: int
    returned: int
    copies: int
    out_now: int
    shelf_in_use: float
    by_month: list[LibraryMonth]
    top_titles: list[LibraryTitle]
    # distinct borrowers in the window, and loans out past their due date now
    members: int = 0
    overdue_now: int = 0
    by_category: list[LibraryCategory] = []


class CategoryValue(BaseModel):
    label: str
    items: int
    value: Decimal


class AssetStatusValue(BaseModel):
    label: str
    count: int
    value: Decimal


class LowStockRow(BaseModel):
    item_id: int
    name: str
    sku: Optional[str] = None
    on_hand: Decimal
    reorder_level: Decimal


class InventoryValuation(BaseModel):
    stock_value: Decimal
    asset_value: Decimal
    items: int
    assets: int
    by_category: list[CategoryValue]
    assets_by_status: list[AssetStatusValue]
    low_stock: list[LowStockRow]


class DepartmentPay(BaseModel):
    department: str
    staff: int
    gross: Decimal
    deductions: Decimal
    net: Decimal
    employer_cost: Decimal


class PayrollByDepartment(BaseModel):
    run_id: Optional[int] = None
    period: Optional[str] = None
    status: Optional[str] = None
    departments: list[DepartmentPay]


class ChannelRow(BaseModel):
    """One delivery channel, counted by what became of each message. Skipped
    is not a failure — it is the parent with no mobile number on file."""
    channel: str
    total: int
    queued: int = 0
    sent: int = 0
    delivered: int = 0
    failed: int = 0
    skipped: int = 0
    # opened by the recipient (only the in-app inbox records reading)
    read: int = 0


class MonthCount(BaseModel):
    month: str
    count: int


class NotificationReport(BaseModel):
    from_date: date
    to_date: date
    notices: int
    recipients: int
    by_audience: list[LabelCount]
    by_month: list[MonthCount]
    channels: list[ChannelRow]
