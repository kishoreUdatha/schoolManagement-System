"""Mark implemented APIs in School_ERP_Database_and_API_Design.xlsx.

Adds/refreshes three columns on the "API Catalog" sheet — Status, Our Endpoint(s),
Notes — and an "API Progress" sheet with per-module counts (COUNTIFS formulas,
so hand edits to Status are counted too).

Status values:
    Done         the spec'd operation exists (possibly under a different path/shape)
    Partial      some of it exists; Notes says what's missing
    Not Started  nothing yet
    N/A          intentionally not offered (e.g. receipts are immutable)

Update MAP below when a module lands, then run on the host (Excel must be closed):
    python backend/scripts/update_api_tracker.py
"""
import shutil
import sys
from copy import copy
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "School_ERP_Database_and_API_Design.xlsx"

D, P, N, NA = "Done", "Partial", "Not Started", "N/A"
VIA_LIST = "No single-GET; the record comes back in the list"


def crud(lst=None, create=None, get=None, update=None, note=None, get_via_list=False):
    """Shorthand for the four CRUD rows. Each arg: path string, (status, path, note) or None."""
    out = {}
    for op, v in (("List", lst), ("Create", create), ("Get", get), ("Update", update)):
        if v is None:
            if op == "Get" and get_via_list and lst:
                out[op] = (D, lst if isinstance(lst, str) else lst[1], VIA_LIST)
            else:
                out[op] = (N, "", note or "")
        elif isinstance(v, str):
            out[op] = (D, v, "")
        else:
            out[op] = v
    return out


def none(note=""):
    return crud(note=note)


# (resource/table) -> {operation or action name: (status, our endpoint(s), notes)}
MAP = {
    # ---------------- Identity & Access ----------------
    "users": {
        **crud("GET /school/staff; GET /school/parents", "POST /school/staff; POST /school/parents",
               "GET /school/staff/{id}; GET /school/parents/{id}", "PATCH /school/staff/{id}; PATCH /school/parents/{id}"),
        "activate": (D, "POST /school/staff/{id}/activate; POST /school/parents/{id}/activate", ""),
        "suspend": (D, "POST /school/staff/{id}/deactivate; POST /school/parents/{id}/deactivate", ""),
        "reset-password": (D, "POST /school/staff/{id}/reset-password; POST /school/parents/{id}/reset-password", ""),
    },
    "roles": crud("GET /school/roles", "POST /school/roles", None, "PUT /school/roles/{id}", get_via_list=True),
    "permissions": crud((D, "GET /school/permissions", "Fixed catalogue in code; schools pick from it"),
                        (NA, "", "The catalogue is defined by the application"), (D, "GET /school/permissions", ""),
                        (NA, "", "")),
    "user_role_assignments": crud("GET /school/role-assignments", "POST /school/role-assignments", None,
                                  (D, "DELETE /school/role-assignments/{id}", "Take the role away and give another"),
                                  get_via_list=True),
    # ---------------- School & Academic Setup ----------------
    "schools": crud("GET /super-admin/tenants", "POST /super-admin/tenants",
                    "GET /super-admin/tenants/{id}; GET /school/profile", "PATCH /school/profile"),
    "branches": crud("GET /school/branches", "POST /school/branches", None, "PUT /school/branches/{id}",
                     get_via_list=True),
    "academic_years": crud("GET /school/academic-years", "POST /school/academic-years",
                           "GET /school/academic-years/{id}", "PATCH /school/academic-years/{id}"),
    "terms": crud("GET /school/academic-years/{id}/terms", "POST /school/academic-years/{id}/terms", None,
                  "PUT /school/academic-years/{id}/terms/{term_id}", get_via_list=True),
    "departments": crud("GET /school/departments", "POST /school/departments", None, "PUT /school/departments/{id}",
                        get_via_list=True),
    "grades": crud("GET /school/classes", "POST /school/classes", "GET /school/classes/{id}", "PATCH /school/classes/{id}",
                   note="Called 'classes' here"),
    "sections": crud((D, "GET /school/classes", "Sections are returned inside each class"),
                     "POST /school/classes/{id}/sections", (D, "GET /school/classes/{id}", "Returned inside the class"),
                     "PATCH /school/sections/{id}"),
    "subjects": crud("GET /school/subjects", "POST /school/subjects", "GET /school/subjects/{id}", "PATCH /school/subjects/{id}"),
    "rooms": crud("GET /school/rooms", "POST /school/rooms", None, "PUT /school/rooms/{id}", get_via_list=True),
    # ---------------- Admissions ----------------
    "admission_enquiries": {
        **crud("GET /school/admissions/enquiries", "POST /school/admissions/enquiries; POST /public/admissions/{tenant}/{school}/enquiries",
               "GET /school/admissions/enquiries/{id}", "PATCH /school/admissions/enquiries/{id}"),
        "convert": (D, "POST /school/admissions/enquiries/{id}/convert", "Creates the student record"),
    },
    "admission_applications": {
        **crud("GET /school/admissions/applications", "POST /school/admissions/applications; POST /public/admissions/{tenant}/{school}/applications",
               "GET /school/admissions/applications/{id}", "PUT /school/admissions/applications/{id}"),
        "submit": (D, "POST /school/admissions/applications/{id}/submit", ""),
        "approve": (D, "POST /school/admissions/applications/{id}/decide", "approve = true"),
        "reject": (D, "POST /school/admissions/applications/{id}/decide", "approve = false, reason required"),
        "confirm-admission": (D, "POST /school/admissions/applications/{id}/admit", "Creates the student and parent login"),
    },
    "admission_assessments": crud((D, "GET /school/admissions/applications/{id}", "Assessments come with the application"),
                                  "POST /school/admissions/applications/{id}/assessments",
                                  (D, "GET /school/admissions/applications/{id}", ""),
                                  "PUT /school/admissions/applications/assessments/{id}"),
    # ---------------- Students & Guardians ----------------
    "students": {
        **crud("GET /school/students", "POST /school/students; POST /school/students/bulk", "GET /school/students/{id}",
               "PATCH /school/students/{id}"),
        "promote": (D, "POST /school/students/promote", ""),
        "transfer": (P, "POST /school/certificates (TC); POST /school/students/{id}/deactivate", "TC issue + deactivate; no inter-school transfer"),
        "exit": (D, "POST /school/students/{id}/deactivate", "Enrolment closed as 'left'"),
    },
    "student_enrollments": crud("GET /school/enrollments; GET /school/students/{id}/enrollments",
                                (D, "(automatic)", "Created on admission / promotion"), None,
                                "PATCH /school/enrollments/{id}", get_via_list=True),
    "guardians": crud("GET /school/students/{id}/guardians", "POST /school/students/{id}/guardians", None,
                      "PATCH /school/students/{id}/guardians/{guardian_id}", get_via_list=True),
    # ---------------- Staff & Teachers ----------------
    "employees": crud("GET /school/staff", "POST /school/staff", "GET /school/staff/{id}", "PATCH /school/staff/{id}"),
    "teacher_assignments": crud("GET /school/classes/{id}/subjects; GET /teacher/my-classes", "POST /school/classes/{id}/subjects",
                                None, "PATCH /school/class-subjects/{id}; PATCH /school/sections/{id} (class teacher)",
                                get_via_list=True),
    # ---------------- Academics & Curriculum ----------------
    "curricula": crud("GET /school/syllabus", (D, "POST /school/syllabus/{cs_id}/chapters", "A syllabus exists per class-subject"),
                      "GET /school/syllabus/{cs_id}", (D, "POST /school/syllabus/{cs_id}/copy; PUT /school/syllabus/{cs_id}/chapter-order", "")),
    "curriculum_units": crud((D, "GET /school/syllabus/{cs_id}", "Chapters + topics"), "POST /school/syllabus/{cs_id}/chapters",
                             (D, "GET /school/syllabus/{cs_id}", "Returned inside the syllabus"), "PUT /school/syllabus/chapters/{id}"),
    "learning_outcomes": crud("GET /school/learning-outcomes", "POST /school/learning-outcomes",
                              "GET /school/learning-outcomes/{id}", "PATCH /school/learning-outcomes/{id}"),
    "lesson_plans": {
        **crud("GET /school/lesson-plans", "POST /school/lesson-plans", None, "PUT /school/lesson-plans/{id}", get_via_list=True),
        "submit": (D, "POST /school/lesson-plans/{id}/submit", ""),
        "approve": (D, "POST /school/lesson-plans/{id}/review", "decision approve | return"),
        "complete": (D, "POST /school/lesson-plans/{id}/deliver", "Marks the plan's topics as covered"),
    },
    "academic_calendar_events": crud("GET /school/events; GET /school/calendar", "POST /school/events", None,
                                     "PUT /school/events/{id}", get_via_list=True),
    "teaching_resources": crud("GET /school/teaching-resources; GET /parent/me/children/{id}/resources",
                               "POST /school/teaching-resources", "GET /school/teaching-resources/{id}",
                               "PATCH /school/teaching-resources/{id}"),
    # ---------------- Attendance ----------------
    "attendance_sessions": {
        **crud("GET /school/attendance/registers; GET /teacher/attendance", "POST /teacher/attendance/save",
               "GET /teacher/attendance", "POST /teacher/attendance/save"),
        "mark": (D, "POST /teacher/attendance/save", ""),
        "lock": (D, "POST /school/attendance/registers/lock", "Also POST /school/attendance/registers/lock-day for the whole day"),
        "reopen": (D, "POST /school/attendance/registers/reopen", "Reason required; kept against the register"),
    },
    "student_leave_requests": {
        **crud("GET /school/student-leaves; GET /parent/me/children/{id}/leaves", "POST /parent/me/children/{id}/leaves", None,
               (P, "POST /parent/me/children/{id}/leaves/{leave_id}/cancel", "Cancel only; re-apply to change dates"),
               get_via_list=True),
        "approve": (D, "POST /school/student-leaves/{id}/decide", "approve = true; class teacher or admin"),
        "reject": (D, "POST /school/student-leaves/{id}/decide", "approve = false, note required"),
    },
    # ---------------- Timetable & Substitution ----------------
    "timetables": {
        **crud("GET /school/sections/{id}/timetable; GET /teacher/timetable", "PUT /school/sections/{id}/timetable/{period_id}",
               "GET /school/sections/{id}/timetable", "PUT /school/sections/{id}/timetable/{period_id}"),
        "validate": (D, "GET /school/sections/clashes", "Teacher clash check"),
        "publish": (D, "POST /school/sections/{id}/timetable/publish", ""),
    },
    "timetable_slots": crud((D, "GET /school/sections/{id}/timetable", ""), "PUT /school/sections/{id}/timetable/{period_id}",
                            None, "PUT /school/sections/{id}/timetable/{period_id}", get_via_list=True),
    "substitutions": crud((D, "GET /school/cover/day?date=", "Slots needing cover (staff leave / marked absent)"),
                          "POST /school/cover/assign", None, (D, "POST /school/cover/assign; DELETE /school/cover/{id}", ""),
                          get_via_list=True),
    # ---------------- Homework ----------------
    "learning_tasks": {
        **crud("GET /teacher/homework", "POST /teacher/homework", "GET /teacher/homework/{id}", "PATCH /teacher/homework/{id}"),
        "publish": (D, "POST /teacher/homework", "Published on create"),
        "close": (D, "POST /teacher/homework/{id}/close", "closed = false reopens it"),
    },
    "task_submissions": {
        **crud("GET /teacher/homework/{id}/submissions", "POST /parent/me/children/{id}/homework/{hw}/submission",
               "GET /parent/me/children/{id}/homework/{hw}/submission", "PATCH /parent/me/children/{id}/homework/{hw}/submission"),
        "evaluate": (D, "PATCH /teacher/homework/submissions/{id}/review", ""),
        "return": (D, "PATCH /teacher/homework/submissions/{id}/review", "status = rejected"),
    },
    "rubrics": crud("GET /school/rubrics", "POST /school/rubrics", "GET /school/rubrics/{id}", "PATCH /school/rubrics/{id}"),
    # ---------------- Examinations & Results ----------------
    "exam_types": crud("GET /school/exam-types", "POST /school/exam-types", None, "PUT /school/exam-types/{id}",
                       get_via_list=True),
    "exams": {
        **crud("GET /school/exams", "POST /school/exams", "GET /school/exams/{id}", "PATCH /school/exams/{id}"),
        "schedule": (D, "POST /school/exams/{id}/papers", ""),
        "open-marks": (P, "", "Marks entry is open as soon as papers exist"),
        "publish-results": (D, "POST /school/exams/{id}/publish", ""),
    },
    "exam_schedules": crud((D, "GET /school/exams/{id}", "Papers returned inside the exam"), "POST /school/exams/{id}/papers",
                           (D, "GET /school/exams/{id}", ""), "PATCH /school/exams/papers/{id}"),
    "mark_entries": {
        **crud("GET /teacher/marks/papers/{id}", "POST /teacher/marks/papers/{id}/save", "GET /teacher/marks/papers/{id}",
               "POST /teacher/marks/papers/{id}/save"),
        "bulk": (D, "POST /teacher/marks/papers/{id}/save", "Whole paper in one call"),
        "verify": (P, "POST /school/approvals (marks correction)", "Correction approvals exist; no verification step"),
    },
    "grade_scales": crud("GET /school/grade-scales", "POST /school/grade-scales; POST /school/grade-scales/seed-cbse",
                         "GET /school/grade-scales/{id}", "PUT /school/grade-scales/{id}"),
    "results": {
        **crud((D, "GET /parent/me/children/{id}/exams/{exam_id}", "Computed from marks"), (N, "", "Computed on the fly"),
               "GET /parent/me/children/{id}/exams/{exam_id}", (N, "", "")),
        "calculate": (D, "(computed on read)", ""),
        "approve": (D, "POST /school/exams/{id}/approve-results", "Principal/admin; can be required before publishing"),
        "publish": (D, "POST /school/exams/{id}/publish", ""),
        "revise": (P, "POST /school/exams/{id}/unpublish", "Unpublish, correct, republish"),
    },
    "report_cards": crud("GET /school/exams/{id}/sections/{section_id}/remarks", (D, "(generated PDF)", ""),
                         "GET /parent/me/children/{id}/exams/{exam_id}/report-card.pdf",
                         "PUT /school/exams/{id}/students/{student_id}/remark; PUT /school/report-card-settings"),
    # ---------------- Fees & Finance ----------------
    "fee_heads": crud("GET /school/fees/heads", "POST /school/fees/heads", None, "PATCH /school/fees/heads/{id}", get_via_list=True),
    "fee_structures": crud("GET /school/fees/structures", "POST /school/fees/structures", None, "PATCH /school/fees/structures/{id}",
                           get_via_list=True),
    "student_fee_charges": crud("GET /school/fees/student-fees; GET /parent/me/children/{id}/fees", "POST /school/fees/generate",
                                None, (P, "POST /school/fees/student-fees/{id}/waive", "Waive only"), get_via_list=True),
    "concessions": crud("GET /school/accounts/concessions", "POST /school/accounts/concessions", None,
                        (P, "POST /school/accounts/concessions/{id}/end", "End only"), get_via_list=True),
    "fine_rules": crud("GET /school/fees/late-fee-rules", "POST /school/fees/late-fee-rules", None,
                       "PUT /school/fees/late-fee-rules/{id}", get_via_list=True),
    "payments": {
        **crud("GET /school/accounts/collections; GET /school/payments/online", "POST /school/fees/student-fees/{id}/record-payment",
               (P, "GET /school/payments/online/{id}/receipt.pdf", "Via receipt"), (NA, "", "Payments are reversed, not edited")),
        "create-intent": (D, "POST /parent/me/children/{id}/fees/pay", "Razorpay order"),
        "confirm": (D, "POST /parent/me/children/{id}/fees/pay/verify; POST /public/payments/razorpay/{school_id}/webhook", ""),
        "reconcile": (P, "POST /public/payments/razorpay/{school_id}/webhook", "Webhook settles late payments; no report"),
    },
    "receipts": crud("GET /school/accounts/collections", (D, "(automatic)", "Receipt no. FRyymm-nnnnn on every collection"),
                     "GET /school/payments/online/{id}/receipt.pdf; GET /parent/me/children/{id}/payments/{order_id}/receipt.pdf",
                     (NA, "", "Receipts are immutable")),
    "refunds": {
        **crud("GET /school/fees/refunds", "POST /school/fees/refunds", None,
               (D, "POST /school/fees/refunds/{id}/decide", "Approve / reject"), get_via_list=True),
        "approve": (D, "POST /school/fees/refunds/{id}/decide", "School admin or principal"),
        "process": (D, "POST /school/fees/refunds/{id}/process", "Records the payout; shows in the cash book"),
    },
    "finance_transactions": crud("GET /school/accounts/cash-book; GET /school/accounts/expenses; GET /school/accounts/income",
                                 "POST /school/accounts/expenses; POST /school/accounts/income", None,
                                 (P, "POST /school/accounts/expenses/{id}/void", "Void only"), get_via_list=True),
    "vendors": crud("GET /school/inventory/suppliers", "POST /school/inventory/suppliers", None, "PUT /school/inventory/suppliers/{id}",
                    get_via_list=True),
    # ---------------- HR & Payroll ----------------
    "job_openings": crud("GET /school/hr/openings", "POST /school/hr/openings", "GET /school/hr/openings/{id}",
                         "PUT /school/hr/openings/{id}"),
    "candidate_applications": crud("GET /school/hr/applications", "POST /school/hr/applications; POST /public/careers/{tenant}/{school}/openings/{id}/apply",
                                   "GET /school/hr/applications/{id}", "POST /school/hr/applications/{id}/stage"),
    "interview_schedules": crud((D, "GET /school/hr/applications/{id}", "Interviews come with the application"),
                                "POST /school/hr/applications/{id}/interviews",
                                (D, "GET /school/hr/applications/{id}", ""), "PUT /school/hr/interviews/{id}"),
    "offers": crud((D, "GET /school/hr/applications/{id}", "The offer comes with the application"),
                   "POST /school/hr/applications/{id}/offer", (D, "GET /school/hr/applications/{id}", ""),
                   "POST /school/hr/offers/{id}/respond; POST /school/hr/offers/{id}/send"),
    "leave_types": crud("GET /school/hr/leave-types; GET /staff/leaves/types", "POST /school/hr/leave-types", None,
                        "PUT /school/hr/leave-types/{id}", get_via_list=True),
    "leave_requests": {
        **crud("GET /school/staff-leaves; GET /staff/leaves", "POST /staff/leaves", None, (N, "", ""), get_via_list=True),
        "submit": (D, "POST /staff/leaves", ""),
        "approve": (D, "POST /school/staff-leaves/{id}/decide", ""),
        "reject": (D, "POST /school/staff-leaves/{id}/decide", ""),
        "cancel": (D, "POST /staff/leaves/{id}/cancel", ""),
    },
    "payroll_runs": {
        **crud("GET /school/payroll/runs", "POST /school/payroll/runs", "GET /school/payroll/runs/{id}",
               "PATCH /school/payroll/runs/{id}/payslips/{slip_id}"),
        "calculate": (D, "POST /school/payroll/runs/{id}/recalculate", ""),
        "approve": (D, "POST /school/payroll/runs/{id}/finalize", ""),
        "post": (D, "POST /school/payroll/runs/{id}/paid", "Plus bank file CSV"),
    },
    # ---------------- Transport ----------------
    "vehicles": crud("GET /school/transport/vehicles", "POST /school/transport/vehicles", "GET /school/transport/vehicles/{id}",
                     "PATCH /school/transport/vehicles/{id}"),
    "transport_routes": crud("GET /school/transport/routes", "POST /school/transport/routes", "GET /school/transport/routes/{id}",
                             "PATCH /school/transport/routes/{id}"),
    "transport_stops": crud((D, "GET /school/transport/routes/{id}", "Stops live inside the route"),
                            (D, "PATCH /school/transport/routes/{id}", ""), (D, "GET /school/transport/routes/{id}", ""),
                            (D, "PATCH /school/transport/routes/{id}", "")),
    "transport_assignments": crud("GET /school/transport/assignments", "POST /school/transport/assignments", None,
                                  (P, "POST /school/transport/assignments/{id}/end", "End only"), get_via_list=True),
    "trips": {
        **crud("GET /school/transport/trips", "POST /school/transport/trips; POST /school/transport/trips/generate",
               "GET /school/transport/trips/{id}", "PATCH /school/transport/trips/{id}"),
        "start": (D, "PATCH /school/transport/trips/{id}", "status = in_progress"),
        "complete": (D, "PATCH /school/transport/trips/{id}", "status = completed"),
        "cancel": (D, "PATCH /school/transport/trips/{id}", "status = cancelled"),
    },
    # ---------------- Library ----------------
    "book_titles": crud("GET /school/library/books", "POST /school/library/books", "GET /school/library/books/{id}",
                        "PATCH /school/library/books/{id}"),
    "book_copies": crud((D, "GET /school/library/books/{id}", "Copies inside the book"), "POST /school/library/books/{id}/copies",
                        (D, "GET /school/library/books/{id}", ""), "PATCH /school/library/copies/{id}"),
    "circulation_transactions": {
        **crud("GET /school/library/loans", "POST /school/library/loans", None,
               (P, "POST /school/library/loans/{id}/lost", "Via actions"), get_via_list=True),
        "issue": (D, "POST /school/library/loans", ""),
        "return": (D, "POST /school/library/loans/{id}/return", ""),
        "renew": (D, "POST /school/library/loans/{id}/renew", ""),
    },
    "reservations": crud("GET /school/library/reservations", "POST /school/library/reservations", None,
                         (P, "POST /school/library/reservations/{id}/cancel", "Cancel only"), get_via_list=True),
    "library_fines": crud((P, "GET /school/library/loans", "Fines shown on loans"), "POST /school/library/loans/{id}/fine",
                          (P, "GET /school/library/loans", ""), (P, "POST /school/library/loans/{id}/fine", "Collect / waive")),
    # ---------------- Hostel ----------------
    "hostels": crud("GET /school/hostels", "POST /school/hostels", None, "PUT /school/hostels/{id}", get_via_list=True),
    "hostel_rooms": crud("GET /school/hostels/{id}/rooms", "POST /school/hostels/{id}/rooms", None, "PATCH /school/hostels/rooms/{id}",
                         get_via_list=True),
    "hostel_allocations": {
        **crud("GET /school/hostels/{id}/residents", "POST /school/hostels/allocations", None,
               (P, "POST /school/hostels/allocations/{id}/vacate", "Vacate only"), get_via_list=True),
        "allocate": (D, "POST /school/hostels/allocations", ""),
        "transfer": (P, "vacate + allocate", "No single transfer action"),
        "vacate": (D, "POST /school/hostels/allocations/{id}/vacate", ""),
    },
    "outing_requests": crud("GET /school/hostels/{id}/outings; GET /parent/me/children/{id}/hostel/outings",
                            "POST /school/hostels/outings; POST /parent/me/children/{id}/hostel/outings", None,
                            "POST /school/hostels/outings/{id}/decide | out | returned", get_via_list=True),
    # ---------------- Health, Counselling & Discipline ----------------
    "medical_profiles": crud((P, "GET /school/health/alerts", "Alert list only"), "PUT /school/health/students/{id}/profile",
                             "GET /school/health/students/{id}", "PUT /school/health/students/{id}/profile; PUT /parent/me/children/{id}/health/profile"),
    "clinic_visits": crud("GET /school/health/visits", "POST /school/health/visits", None, (P, "DELETE /school/health/visits/{id}", "Delete only"),
                          get_via_list=True),
    "counselling_cases": crud("GET /school/discipline/counselling/cases", "POST /school/discipline/counselling/cases",
                              "GET /school/discipline/counselling/cases/{id}", "PATCH /school/discipline/counselling/cases/{id}"),
    "discipline_incidents": crud("GET /school/discipline/incidents", "POST /school/discipline/incidents",
                                 "GET /school/discipline/incidents/{id}", "PATCH /school/discipline/incidents/{id}"),
    # ---------------- Visitor & Security ----------------
    "visitors": {
        **crud("GET /school/front-desk/visitors", (D, "POST /school/front-desk/visits", "Created from the gate sign-in, matched on phone"),
               "GET /school/front-desk/visitors/{id}", "PUT /school/front-desk/visitors/{id}"),
        "block": (D, "POST /school/front-desk/visitors/{id}/block", "Bar from site or lift it; check-in refuses a barred visitor"),
    },
    "visits": {
        **crud("GET /school/front-desk/visits", "POST /school/front-desk/visits", None,
               (P, "POST /school/front-desk/visits/{id}/cancel", "Cancel only"), get_via_list=True),
        "approve": (P, "POST /school/front-desk/visits/{id}/deny", "Pre-registration + deny; no host approval step"),
        "check-in": (D, "POST /school/front-desk/visits/{id}/check-in", ""),
        "check-out": (D, "POST /school/front-desk/visits/{id}/check-out", ""),
    },
    "security_incidents": crud("GET /school/front-desk/incidents", "POST /school/front-desk/incidents", None,
                               "PATCH /school/front-desk/incidents/{id}", get_via_list=True),
    # ---------------- Inventory, Assets & Labs ----------------
    "inventory_items": crud("GET /school/inventory/items", "POST /school/inventory/items", None, "PUT /school/inventory/items/{id}",
                            get_via_list=True),
    "stock_transactions": {
        **crud("GET /school/inventory/moves", "POST /school/inventory/moves", None, (NA, "", "Stock moves are immutable"),
               get_via_list=True),
        "receive": (D, "POST /school/inventory/moves", "kind = purchase"),
        "issue": (D, "POST /school/inventory/moves", "kind = issue"),
        "adjust": (D, "POST /school/inventory/moves", "kind = adjustment"),
    },
    "assets": crud("GET /school/inventory/assets", "POST /school/inventory/assets", "GET /school/inventory/assets/{id}",
                   "PATCH /school/inventory/assets/{id}"),
    "asset_assignments": crud((P, "GET /school/inventory/assets/{id}", "History inside the asset"), "POST /school/inventory/assets/{id}/events",
                              (P, "GET /school/inventory/assets/{id}", ""), (NA, "", "Recorded as events")),
    "labs": crud("GET /school/labs", "POST /school/labs", None, "PUT /school/labs/{id}", get_via_list=True),
    "lab_bookings": crud("GET /school/lab-bookings", "POST /school/lab-bookings", None,
                         (D, "POST /school/lab-bookings/{id}/cancel", "Cancel; rebook for a change"), get_via_list=True),
    # ---------------- Events, PTM & Communication ----------------
    "events": crud("GET /school/events; GET /parent/me/events", "POST /school/events", None, "PUT /school/events/{id}",
                   get_via_list=True),
    "ptm_schedules": crud("GET /school/ptm", "POST /school/ptm", "GET /school/ptm/{id}", "PUT /school/ptm/{id}"),
    "ptm_slots": crud("GET /school/ptm/{id}; GET /parent/me/ptm; GET /teacher/ptm", (D, "POST /school/ptm/{id}/teachers", "Slots generated per teacher"),
                      None, (D, "POST /parent/me/ptm/book; PUT /teacher/ptm/slots/{id}", "Book / cancel / outcome"), get_via_list=True),
    "announcements": {
        **crud("GET /school/notices", "POST /school/notices", "GET /school/notices/{id}", "PATCH /school/notices/{id}"),
        "schedule": (D, "PATCH /school/notices/{id}", "scheduled_at"),
        "publish": (D, "POST /school/notices/{id}/send", ""),
    },
    "message_threads": crud("GET /parent/me/conversations; GET /teacher/conversations", "POST /parent/me/conversations",
                            "GET /teacher/conversations/{id}/messages", (P, "POST /teacher/conversations/{id}/mark-read", "Mark read only")),
    "messages": crud("GET /teacher/conversations/{id}/messages", "POST /teacher/conversations/{id}/messages", None,
                     (NA, "", "Messages aren't editable"), get_via_list=True),
    # ---------------- Documents & Certificates ----------------
    "documents": crud("GET /school/documents", "POST /school/documents; POST /parent/me/children/{id}/documents",
                      "GET /school/documents/{id}/file", "PATCH /school/documents/{id}; POST /school/documents/{id}/verify"),
    "certificate_templates": crud("GET /school/certificates/templates", "POST /school/certificates/templates", None,
                                  "PATCH /school/certificates/templates/{id}", get_via_list=True),
    "certificate_issues": {
        **crud("GET /school/certificates", "POST /school/certificates; POST /parent/me/children/{id}/certificates",
               "GET /school/certificates/{id}/pdf", "POST /school/certificates/{id}/decide"),
        "generate": (D, "GET /school/certificates/{id}/pdf; POST /school/certificates/preview", ""),
        "revoke": (D, "POST /school/certificates/{id}/cancel", ""),
    },
    # ---------------- Reports, Settings & Audit ----------------
    "report_definitions": crud((P, "GET /school/reports/attendance/*", "Fixed reports, not user-defined")),
    "export_jobs": {
        **crud((P, "GET /school/exports/*.csv", "Synchronous CSV exports"), (P, "GET /school/exports/*.csv", ""), None, (NA, "", "")),
        "run": (D, "GET /school/exports/{students|staff|fees|marks|homework|behaviour}.csv", ""),
        "download": (D, "GET /school/exports/*.csv", ""),
    },
    "system_settings": crud((P, "GET /school/profile; GET /school/library/settings; GET /school/payroll/settings", "Per-module settings"),
                            (NA, "", ""), "GET /school/profile", "PATCH /school/profile; PATCH /school/library/settings; PATCH /school/payroll/settings"),
    "integration_configs": crud((P, "GET /school/payments/gateway", "Payment gateway only"), "PUT /school/payments/gateway",
                                "GET /school/payments/gateway", "PUT /school/payments/gateway"),
    "import_jobs": {
        **none("Students bulk import is synchronous"),
        "upload": (P, "POST /school/students/bulk; GET /school/students/import-template.csv", "Students only"),
        "validate": (P, "POST /school/students/bulk", "Validates and reports row errors"),
        "commit": (P, "POST /school/students/bulk", ""),
    },
}


# APIs we built that the spec catalog doesn't list. Appended to "API Catalog" as
# API-X### rows (Release = "Added"), rebuilt on every run.
# (module, resource, operation, method, path, purpose, roles)
EXTRA = [
    ("Homework & Assignments", "rubrics", "Action", "POST", "/school/rubrics/{id}/criteria", "Add a criterion (frozen once work is marked against it)", "School Admin, Teacher (own rubric)"),
    ("Homework & Assignments", "rubrics", "Action", "PUT", "/school/rubrics/criteria/{id}", "Edit a criterion", "School Admin, Teacher (own rubric)"),
    ("Homework & Assignments", "rubrics", "Delete", "DELETE", "/school/rubrics/{id}", "Delete a rubric no homework uses", "School Admin, Teacher (own rubric)"),
    ("Homework & Assignments", "task_submissions", "Action", "PUT", "/teacher/homework/submissions/{id}/rubric-scores", "Mark a submission criterion by criterion; total is computed", "Subject Teacher"),
    ("Academics & Curriculum", "learning_outcomes", "Action", "GET", "/school/learning-outcomes/coverage", "How far a section has met the outcomes, from the topics taught", "School Admin, Principal, Teacher"),
    ("Academics & Curriculum", "learning_outcomes", "Delete", "DELETE", "/school/learning-outcomes/{id}", "Delete an outcome", "School Admin, Subject Teacher"),
    ("Academics & Curriculum", "teaching_resources", "Action", "GET", "/school/teaching-resources/{id}/file", "Download the attached file", "School Admin, Principal, Teacher"),
    ("Academics & Curriculum", "teaching_resources", "Action", "GET", "/parent/me/children/{id}/resources/{rid}/file", "Download shared study material", "Parent"),
    ("Academics & Curriculum", "teaching_resources", "Delete", "DELETE", "/school/teaching-resources/{id}", "Remove a resource", "School Admin, Subject Teacher"),
    ("Attendance", "attendance_sessions", "Action", "GET", "/school/attendance/registers", "Every section's register for a day: marked by, counts, lock state", "School Admin, Principal, Staff"),
    ("Attendance", "attendance_sessions", "Action", "POST", "/school/attendance/registers/lock-day", "Lock every marked register for that day in one go", "School Admin, Principal, attendance.correct"),
    ("Visitor & Security", "visitors", "Action", "GET", "/school/front-desk/visitors/{id}/visits", "Every past visit by that person", "School Admin, Principal, Front desk"),
    ("Visitor & Security", "visitors", "Action", "POST", "/school/front-desk/visitors/backfill", "Build master records from visits logged before this screen existed", "School Admin, Principal, Front desk"),
    ("Online Exams & Question Bank", "questions", "List", "GET", "/school/questions", "Search the bank (subject, class level, chapter, Bloom, difficulty, kind)", "School Admin, Principal, Teacher"),
    ("Online Exams & Question Bank", "questions", "Create", "POST", "/school/questions", "Add a question (single/multiple/true-false/numeric/short)", "School Admin, Teacher (own subjects)"),
    ("Online Exams & Question Bank", "questions", "Get", "GET", "/school/questions/{id}", "Get a question", "School Admin, Principal, Teacher"),
    ("Online Exams & Question Bank", "questions", "Update", "PUT", "/school/questions/{id}", "Edit (answer locked once used in a published test)", "School Admin, Teacher (own subjects)"),
    ("Online Exams & Question Bank", "questions", "Action", "POST", "/school/questions/{id}/active", "Activate / deactivate", "School Admin, Teacher (own subjects)"),
    ("Online Exams & Question Bank", "questions", "Delete", "DELETE", "/school/questions/{id}", "Delete an unused question", "School Admin, Teacher (own subjects)"),
    ("Online Exams & Question Bank", "online_tests", "List", "GET", "/school/online-tests", "List tests", "School Admin, Principal, Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Create", "POST", "/school/online-tests", "Create a timed test for a class-subject", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Get", "GET", "/school/online-tests/{id}", "Test with questions, marks and Bloom mix", "School Admin, Principal, Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Update", "PUT", "/school/online-tests/{id}", "Edit until students start", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Delete", "DELETE", "/school/online-tests/{id}", "Delete if nobody attempted", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Action", "POST", "/school/online-tests/{id}/questions", "Add bank questions", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Action", "POST", "/school/online-tests/{id}/auto-pick", "Random pick by Bloom level / difficulty / chapter", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Action", "PUT", "/school/online-tests/{id}/question-order", "Reorder questions", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Action", "POST", "/school/online-tests/{id}/publish", "Publish + notify parents", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Action", "POST", "/school/online-tests/{id}/close", "Close; submit in-progress attempts", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "online_tests", "Action", "GET", "/school/online-tests/{id}/results", "Scores, per-question and per-Bloom analysis", "School Admin, Principal, Teacher"),
    ("Online Exams & Question Bank", "test_attempts", "Get", "GET", "/school/test-attempts/{id}", "One student's answers", "School Admin, Principal, Teacher"),
    ("Online Exams & Question Bank", "test_attempts", "Action", "PUT", "/school/test-attempts/{id}/answers/{question_id}/grade", "Mark a short answer", "School Admin, Subject Teacher"),
    ("Online Exams & Question Bank", "test_attempts", "List", "GET", "/parent/me/children/{id}/tests", "Child's tests with state and score", "Parent"),
    ("Online Exams & Question Bank", "test_attempts", "Create", "POST", "/parent/me/children/{id}/tests/{test_id}/start", "Start / resume (server-timed)", "Parent"),
    ("Online Exams & Question Bank", "test_attempts", "Update", "PUT", "/parent/me/test-attempts/{id}/answers", "Autosave answers", "Parent"),
    ("Online Exams & Question Bank", "test_attempts", "Action", "POST", "/parent/me/test-attempts/{id}/submit", "Submit and auto-mark", "Parent"),
    ("Online Exams & Question Bank", "test_attempts", "Action", "GET", "/parent/me/test-attempts/{id}/result", "Result (per visibility setting)", "Parent"),
    ("Events, PTM & Communication", "event_consents", "Action", "GET", "/school/events/{id}/consents", "Consent report (yes / no / pending)", "School Admin"),
    ("Events, PTM & Communication", "event_consents", "Create", "POST", "/parent/me/events/{id}/consent", "Give or decline consent for a child", "Parent"),
    ("Events, PTM & Communication", "gallery_albums", "List", "GET", "/school/gallery; /parent/me/gallery", "Photo albums", "All school users, Parent"),
    ("Events, PTM & Communication", "gallery_albums", "Create", "POST", "/school/gallery", "Create album", "School Admin"),
    ("Events, PTM & Communication", "gallery_albums", "Action", "POST", "/school/gallery/{id}/photos", "Upload photos", "School Admin"),
    ("Events, PTM & Communication", "gallery_albums", "Action", "POST", "/school/gallery/{id}/publish", "Publish / unpublish + notify", "School Admin"),
    ("Events, PTM & Communication", "calendar", "List", "GET", "/school/calendar; /parent/me/calendar", "Events, holidays, exams, meetings", "All school users, Parent"),
    ("Inventory, Assets & Labs", "lab_bookings", "Action", "GET", "/school/lab-availability", "Which labs are free in each period that day", "All school staff"),
    ("Inventory, Assets & Labs", "rooms", "Delete", "DELETE", "/school/rooms/{id}", "Delete a room no lab uses", "School Admin, settings.manage"),
    ("Inventory, Assets & Labs", "labs", "Delete", "DELETE", "/school/labs/{id}", "Delete a lab with no bookings", "School Admin, settings.manage"),
    ("Identity & Access", "user_role_assignments", "Action", "GET", "/school/me/access", "My roles and what they let me do", "Any signed-in user"),
    ("Identity & Access", "roles", "Delete", "DELETE", "/school/roles/{id}", "Delete an unused custom role", "School Admin, roles.manage"),
    ("School & Academic Setup", "branches", "Action", "PUT", "/school/branches/{id}/sections", "Set which sections are at a branch", "School Admin, branches.manage"),
    ("School & Academic Setup", "branches", "Action", "PUT", "/school/branches/{id}/staff", "Set which staff work at a branch", "School Admin, branches.manage"),
    ("School & Academic Setup", "branches", "Delete", "DELETE", "/school/branches/{id}", "Delete an empty branch", "School Admin, branches.manage"),
    ("Admissions", "application_documents", "Create", "POST", "/school/admissions/applications/{id}/documents", "Upload a supporting document", "School Admin, Principal, Office"),
    ("Admissions", "application_documents", "Action", "POST", "/school/admissions/applications/documents/{id}/verify", "Mark a document checked", "School Admin, Principal, Office"),
    ("Admissions", "application_documents", "Action", "GET", "/school/admissions/applications/documents/{id}/file", "Download a document", "School Admin, Principal, Office"),
    ("Admissions", "application_documents", "Delete", "DELETE", "/school/admissions/applications/documents/{id}", "Remove a document", "School Admin, Principal, Office"),
    ("Admissions", "admission_applications", "Action", "POST", "/school/admissions/applications/{id}/status", "Move along the pipeline", "School Admin, Principal, Office"),
    ("Admissions", "admission_applications", "Action", "POST", "/school/admissions/applications/{id}/fee", "Record the admission fee", "School Admin, Principal, Office"),
    ("Admissions", "admission_applications", "Action", "POST", "/school/admissions/applications/{id}/withdraw", "Applicant withdrew", "School Admin, Principal, Office"),
    ("Admissions", "admission_applications", "Action", "GET", "/school/admissions/applications/funnel", "Counts by status", "School Admin, Principal, Office"),
    ("Admissions", "admission_status_history", "List", "GET", "/school/admissions/applications/{id}", "Every status change, with who and when", "School Admin, Principal, Office"),
    ("HR & Payroll", "candidates", "List", "GET", "/school/hr/candidates", "Everyone who has applied to the school", "School Admin, Principal"),
    ("HR & Payroll", "candidates", "Create", "POST", "/school/hr/candidates", "Add a candidate by hand", "School Admin, Principal"),
    ("HR & Payroll", "candidates", "Action", "POST", "/school/hr/candidates/{id}/resume", "Upload a résumé", "School Admin, Principal"),
    ("HR & Payroll", "candidates", "Action", "GET", "/school/hr/candidates/{id}/resume", "Download the résumé", "School Admin, Principal"),
    ("HR & Payroll", "offers", "Action", "POST", "/school/hr/offers/{id}/hire", "Create the staff member and their login", "School Admin"),
    ("HR & Payroll", "offers", "Action", "POST", "/school/hr/offers/{id}/withdraw", "Withdraw an offer", "School Admin"),
    ("HR & Payroll", "job_openings", "Action", "POST", "/school/hr/openings/{id}/status", "Open, hold, close or mark filled", "School Admin"),
    ("HR & Payroll", "job_openings", "List", "GET", "/public/careers/{tenant}/{school}/openings", "Public careers page", "Anyone"),
    ("HR & Payroll", "leave_balances", "List", "GET", "/school/hr/leave-balances; GET /staff/leaves/balances", "Entitlement per employee and year", "School Admin, Principal; own balance for staff"),
    ("HR & Payroll", "leave_balances", "Create", "POST", "/school/hr/leave-balances/allot", "Allot a year's leave to all staff (with carry forward)", "School Admin"),
    ("HR & Payroll", "leave_balances", "Update", "PATCH", "/school/hr/leave-balances/{id}", "Adjust one balance", "School Admin"),
    ("HR & Payroll", "candidate_applications", "Action", "GET", "/school/hr/pipeline", "Counts by stage and open positions", "School Admin, Principal"),
    ("Health, Counselling & Discipline", "counselling_sessions", "Create", "POST", "/school/discipline/counselling/cases/{id}/sessions", "Add a private session note", "Counsellor, Principal, School Admin"),
    ("Health, Counselling & Discipline", "counselling_cases", "Action", "POST", "/school/discipline/counselling/cases/{id}/inform-parents", "Message the parents (never the notes)", "Counsellor, Principal, School Admin"),
    ("Health, Counselling & Discipline", "discipline_actions", "Create", "POST", "/school/discipline/incidents/{id}/actions", "Record warning / detention / suspension / referral", "School Admin, Principal"),
    ("Health, Counselling & Discipline", "discipline_actions", "Delete", "DELETE", "/school/discipline/actions/{id}", "Remove an action", "School Admin, Principal"),
    ("Health, Counselling & Discipline", "discipline_incidents", "Action", "POST", "/school/discipline/incidents/{id}/share", "Share the incident with parents", "School Admin, Principal"),
    ("Health, Counselling & Discipline", "discipline_incidents", "Action", "GET", "/school/discipline/incidents/summary", "Counts by category/severity/section and repeat students", "School Admin, Principal"),
    ("Health, Counselling & Discipline", "discipline_incidents", "List", "GET", "/parent/me/children/{id}/discipline", "Incidents shared with the parent", "Parent"),
    ("Fees & Finance", "fine_rules", "Action", "GET", "/school/fees/late-fees/preview", "What the late-fee rules would charge today", "School Admin, Accountant, Principal"),
    ("Fees & Finance", "fine_rules", "Action", "POST", "/school/fees/late-fees/apply", "Raise / refresh late fee charges", "School Admin, Accountant"),
    ("Fees & Finance", "refunds", "List", "GET", "/school/fees/refunds/options/{student_id}", "Fees a refund can be raised against", "School Admin, Accountant, Principal"),
    ("Examinations & Results", "report_card_settings", "List", "GET", "/school/report-card-settings", "What the printed report card shows", "School Admin, Principal, Teacher"),
    ("Examinations & Results", "report_card_settings", "Update", "PUT", "/school/report-card-settings", "Attendance, rank, grade legend, approval rule, footer", "School Admin"),
    ("Examinations & Results", "grade_scales", "Action", "POST", "/school/grade-scales/{id}/default", "Make this the school's default scale", "School Admin"),
    ("Timetable & Substitution", "substitutions", "Action", "GET", "/school/cover/candidates", "Ranked substitutes for a slot (free / unavailable / busy)", "School Admin, Principal"),
    ("Timetable & Substitution", "substitutions", "Action", "POST", "/school/cover/auto-assign", "Fill uncovered slots with the best free teacher", "School Admin, Principal"),
    ("Timetable & Substitution", "substitutions", "List", "GET", "/school/cover/mine", "Periods I'm covering", "Teacher, Principal"),
    ("Timetable & Substitution", "substitutions", "List", "GET", "/school/cover/stats", "Covers per teacher (fairness)", "School Admin, Principal"),
    ("Timetable & Substitution", "teacher_availability", "List", "GET", "/school/cover/unavailability", "Weekly blocks when a teacher can't cover", "School Admin, Principal"),
    ("Timetable & Substitution", "teacher_availability", "Create", "POST", "/school/cover/unavailability", "Add a block (day or single period)", "School Admin, Principal"),
    ("Timetable & Substitution", "teacher_availability", "Delete", "DELETE", "/school/cover/unavailability/{id}", "Remove a block", "School Admin, Principal"),
    ("Academics & Curriculum", "topic_coverage", "Action", "PUT", "/school/syllabus/topics/{id}/coverage", "Mark a topic taught in a section", "School Admin, Subject Teacher"),
    ("Academics & Curriculum", "topic_coverage", "List", "GET", "/parent/me/children/{id}/syllabus", "Child's syllabus progress", "Parent"),
]

FILLS = {
    D: PatternFill("solid", fgColor="C6EFCE"),
    P: PatternFill("solid", fgColor="FFEB9C"),
    N: PatternFill("solid", fgColor="F2F2F2"),
    NA: PatternFill("solid", fgColor="DDEBF7"),
}
NEW_HEADERS = ["Status", "Our Endpoint(s)", "Notes", "Last Updated"]


def main():
    if not XLSX.exists():
        sys.exit(f"missing {XLSX}")
    lock = XLSX.with_name("~$" + XLSX.name)
    if lock.exists():
        sys.exit("The workbook is open in Excel; close it first.")
    wb = load_workbook(XLSX)
    ws = wb["API Catalog"]
    header = [c.value for c in ws[1]]
    # find or append our columns
    cols = {}
    for h in NEW_HEADERS:
        if h in header:
            cols[h] = header.index(h) + 1
        else:
            header.append(h)
            cols[h] = len(header)
            cell = ws.cell(row=1, column=cols[h], value=h)
            src = ws.cell(row=1, column=cols[h] - 1)
            cell.font, cell.fill, cell.alignment, cell.border = (
                copy(src.font), copy(src.fill), copy(src.alignment), copy(src.border)
            )
    ws.column_dimensions[get_column_letter(cols["Status"])].width = 13
    ws.column_dimensions[get_column_letter(cols["Our Endpoint(s)"])].width = 60
    ws.column_dimensions[get_column_letter(cols["Notes"])].width = 45
    ws.column_dimensions[get_column_letter(cols["Last Updated"])].width = 12

    today = datetime.now().strftime("%Y-%m-%d")
    extra_rows: dict[int, tuple] = {}
    # rebuild the API-X rows
    for row in range(ws.max_row, 1, -1):
        if str(ws.cell(row, 1).value or "").startswith("API-X"):
            ws.delete_rows(row)
    template = ws.max_row
    for i, (module, res, op, method, path, purpose, roles) in enumerate(EXTRA, start=1):
        r = ws.max_row + 1
        values = {1: f"API-X{i:03d}", 2: module, 3: res, 4: op, 5: method, 6: "/api/v1" + path.split("; ")[0],
                  7: purpose, 8: roles, 16: "Added"}
        for c in range(1, len(header) + 1):
            cell = ws.cell(r, c, values.get(c))
            src = ws.cell(template, c)
            cell.font, cell.border, cell.alignment = copy(src.font), copy(src.border), copy(src.alignment)
        extra_rows[r] = (D, f"{method} {path}", "Beyond the spec catalog")
    unknown = set()
    for row in range(2, ws.max_row + 1):
        table, op, path = ws.cell(row, 3).value, ws.cell(row, 4).value, ws.cell(row, 6).value
        if not table:
            continue
        key = op if op != "Action" else path.rstrip("/").rsplit("/", 1)[-1]
        entry = extra_rows.get(row) or MAP.get(table, {}).get(key)
        if entry is None:
            unknown.add(f"{table}:{key}")
            entry = (N, "", "")
        status_, ep, note = entry
        prev = ws.cell(row, cols["Status"]).value
        ws.cell(row, cols["Status"], status_).fill = FILLS[status_]
        ws.cell(row, cols["Our Endpoint(s)"], ep)
        ws.cell(row, cols["Notes"], note)
        if prev != status_:
            ws.cell(row, cols["Last Updated"], today)
        for h in ("Our Endpoint(s)", "Notes"):
            ws.cell(row, cols[h]).alignment = Alignment(wrap_text=True, vertical="top")
    if ws.auto_filter.ref:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(header))}{ws.max_row}"

    # ---- progress sheet ----
    if "API Progress" in wb.sheetnames:
        del wb["API Progress"]
    ps = wb.create_sheet("API Progress", index=wb.sheetnames.index("API Catalog") + 1)
    status_col = get_column_letter(cols["Status"])
    modules = []
    for row in range(2, ws.max_row + 1):
        m = ws.cell(row, 2).value
        if m and m not in modules:
            modules.append(m)
    heads = ["Module", "Total", D, P, N, NA, "% Done"]
    ps.append(heads)
    for c in ps[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F4E78")
    for i, m in enumerate(modules, start=2):
        ps.append([m, f"=COUNTIF('API Catalog'!B:B,A{i})"]
                  + [f"=COUNTIFS('API Catalog'!B:B,A{i},'API Catalog'!{status_col}:{status_col},\"{s}\")" for s in (D, P, N, NA)]
                  + [f"=IF(B{i}-F{i}=0,0,(C{i}+0.5*D{i})/(B{i}-F{i}))"])
        ps.cell(i, 7).number_format = "0%"
    t = len(modules) + 2
    ps.append(["TOTAL"] + [f"=SUM({c}2:{c}{t - 1})" for c in "BCDEF"] + [f"=IF(B{t}-F{t}=0,0,(C{t}+0.5*D{t})/(B{t}-F{t}))"])
    ps.cell(t, 7).number_format = "0%"
    for c in ps[t]:
        c.font = Font(bold=True)
    ps.append([])
    ps.append([f"% Done counts Partial as half and ignores N/A. Endpoint paths are under /api/v1."])
    ps.append([f"Refreshed {today} by backend/scripts/update_api_tracker.py."])
    ps.column_dimensions["A"].width = 34
    for c in "BCDEFG":
        ps.column_dimensions[c].width = 12
    ps.freeze_panes = "A2"

    backup = XLSX.with_suffix(".backup.xlsx")
    if not backup.exists():
        shutil.copy2(XLSX, backup)
    wb.save(XLSX)

    counts = {}
    for row in range(2, ws.max_row + 1):
        s = ws.cell(row, cols["Status"]).value
        if s:
            counts[s] = counts.get(s, 0) + 1
    print("saved", XLSX.name, counts)
    if unknown:
        print("rows with no mapping (marked Not Started):", ", ".join(sorted(unknown)))


if __name__ == "__main__":
    main()
