from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.v1 import ai, branding, health, timetable
from app.api.v1.super_admin import (
    auth as super_admin_auth,
    payments as super_admin_payments,
    plans as super_admin_plans,
    subscriptions as super_admin_subscriptions,
    tenants as super_admin_tenants,
    usage as super_admin_usage,
)
from app.api.v1.school import (
    academic_years as school_academic_years,
    approvals as school_approvals,
    attendance_reports as school_attendance_reports,
    audit_log as school_audit_log,
    auth as school_auth,
    class_subjects as school_class_subjects,
    fee_reminders as school_fee_reminders,
    staff_leaves as school_staff_leaves,
    classes as school_classes,
    dashboard as school_dashboard,
    exams as school_exams,
    exports as school_exports,
    fees as school_fees,
    holidays as school_holidays,
    notices as school_notices,
    parents as school_parents,
    periods as school_periods,
    profile as school_profile,
    report_cards as school_report_cards,
    sections as school_sections,
    staff as school_staff,
    staff_attendance as school_staff_attendance,
    students as school_students,
    subjects as school_subjects,
    hod_assignments as school_hod_assignments,
    videos as school_videos,
)
from app.api.v1.staff import (
    attendance as staff_attendance_routes,
    leaves as staff_leaves_routes,
)
from app.api.v1.parent import (
    auth as parent_auth,
    behaviour as parent_behaviour,
    children as parent_children,
    exams as parent_exams,
    fees as parent_fees,
    holidays as parent_holidays,
    homework as parent_homework,
    messages as parent_messages,
    notices as parent_notices,
    profile as parent_profile,
    projects as parent_projects,
    timetable as parent_timetable,
    videos as parent_videos,
    weekly_reports as parent_weekly_reports,
)
from app.api.v1.teacher import (
    attendance as teacher_attendance,
    auth as teacher_auth,
    behaviour as teacher_behaviour,
    dashboard as teacher_dashboard,
    homework as teacher_homework,
    marks as teacher_marks,
    messages as teacher_messages,
    my_classes as teacher_my_classes,
    notices as teacher_notices,
    projects as teacher_projects,
    students as teacher_students,
    timetable as teacher_timetable,
    videos as teacher_videos,
    weekly_reports as teacher_weekly_reports,
)
from app.api.v1.principal import (
    approvals as principal_approvals,
    auth as principal_auth,
    dashboard as principal_dashboard,
)
from app.api.v1.accountant import auth as accountant_auth
from app.core.audit import install as install_audit_listener


# Story 22.1 — register the SQLAlchemy before_flush listener once at import time.
install_audit_listener()


async def _fee_reminder_loop():
    """Story 13.3 — periodic in-process fee-reminder check.

    Runs forever, sleeping `fee_reminder_interval_seconds` between iterations.
    Each tick opens a fresh DB session, runs the check across all active
    schools, and logs the summary. Errors are swallowed so the loop never
    dies on transient DB blips.
    """
    import asyncio
    import logging

    log = logging.getLogger("fee_reminders")
    interval = settings.fee_reminder_interval_seconds
    if interval <= 0:
        log.info("Fee reminder scheduler disabled (interval=0).")
        return

    from app.database import SessionLocal
    from app.services import fee_reminder_service

    while True:
        try:
            db = SessionLocal()
            try:
                results = fee_reminder_service.run_daily_for_all_schools(db)
                log.info("Fee reminder tick: %s", results)
            finally:
                db.close()
        except Exception:  # noqa: BLE001
            log.exception("Fee reminder loop crashed; will retry next tick")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    task = asyncio.create_task(_fee_reminder_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(branding.router, prefix="/api/v1/branding", tags=["branding"])
app.include_router(
    super_admin_auth.router,
    prefix="/api/v1/super-admin/auth",
    tags=["super-admin / auth"],
)
app.include_router(
    super_admin_tenants.router,
    prefix="/api/v1/super-admin/tenants",
    tags=["super-admin / tenants"],
)
app.include_router(
    super_admin_plans.router,
    prefix="/api/v1/super-admin/plans",
    tags=["super-admin / plans"],
)
app.include_router(
    super_admin_subscriptions.router,
    prefix="/api/v1/super-admin/tenants",
    tags=["super-admin / subscriptions"],
)
app.include_router(
    super_admin_payments.router,
    prefix="/api/v1/super-admin/tenants",
    tags=["super-admin / payments"],
)
app.include_router(
    super_admin_usage.router,
    prefix="/api/v1/super-admin",
    tags=["super-admin / usage"],
)
app.include_router(
    school_auth.router,
    prefix="/api/v1/school/auth",
    tags=["school / auth"],
)
app.include_router(
    school_profile.router,
    prefix="/api/v1/school/profile",
    tags=["school / profile"],
)
app.include_router(
    school_academic_years.router,
    prefix="/api/v1/school/academic-years",
    tags=["school / academic years"],
)
app.include_router(
    school_classes.router,
    prefix="/api/v1/school/classes",
    tags=["school / classes"],
)
app.include_router(
    school_sections.router,
    prefix="/api/v1/school/sections",
    tags=["school / sections"],
)
app.include_router(
    school_subjects.router,
    prefix="/api/v1/school/subjects",
    tags=["school / subjects"],
)
app.include_router(
    school_class_subjects.classes_subjects_router,
    prefix="/api/v1/school/classes",
    tags=["school / class-subjects"],
)
app.include_router(
    school_class_subjects.class_subjects_router,
    prefix="/api/v1/school/class-subjects",
    tags=["school / class-subjects"],
)
app.include_router(
    school_staff.router,
    prefix="/api/v1/school/staff",
    tags=["school / staff"],
)
app.include_router(
    school_students.router,
    prefix="/api/v1/school/students",
    tags=["school / students"],
)
app.include_router(
    school_parents.router,
    prefix="/api/v1/school/parents",
    tags=["school / parents"],
)
app.include_router(
    parent_auth.router,
    prefix="/api/v1/parent/auth",
    tags=["parent / auth"],
)
app.include_router(
    parent_children.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / children"],
)
app.include_router(
    school_periods.router,
    prefix="/api/v1/school/periods",
    tags=["school / periods"],
)
app.include_router(
    school_hod_assignments.router,
    prefix="/api/v1/school/hod-assignments",
    tags=["school / hod assignments"],
)
app.include_router(
    timetable.router,
    prefix="/api/v1/timetable",
    tags=["timetable"],
)
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(
    parent_timetable.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / timetable"],
)
app.include_router(
    school_fees.router,
    prefix="/api/v1/school/fees",
    tags=["school / fees"],
)
app.include_router(
    parent_fees.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / fees"],
)
app.include_router(
    school_holidays.router,
    prefix="/api/v1/school/holidays",
    tags=["school / holidays"],
)
app.include_router(
    parent_holidays.router,
    prefix="/api/v1/parent/school/holidays",
    tags=["parent / holidays"],
)
app.include_router(
    school_dashboard.router,
    prefix="/api/v1/school/dashboard",
    tags=["school / dashboard"],
)
app.include_router(
    school_notices.router,
    prefix="/api/v1/school/notices",
    tags=["school / notices"],
)
app.include_router(
    school_exams.router,
    prefix="/api/v1/school/exams",
    tags=["school / exams"],
)
app.include_router(
    school_report_cards.router,
    prefix="/api/v1/school/exams",
    tags=["school / report cards"],
)
app.include_router(
    parent_exams.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / exams"],
)
app.include_router(
    parent_videos.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / videos"],
)
app.include_router(
    teacher_videos.router,
    prefix="/api/v1/teacher/videos",
    tags=["teacher / videos"],
)
app.include_router(
    teacher_students.router,
    prefix="/api/v1/teacher/students",
    tags=["teacher / students"],
)
app.include_router(
    teacher_notices.router,
    prefix="/api/v1/teacher/notices",
    tags=["teacher / notices"],
)
app.include_router(
    parent_profile.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / profile"],
)
app.include_router(
    school_videos.router,
    prefix="/api/v1/school/videos",
    tags=["school / videos"],
)
app.include_router(
    parent_notices.router,
    prefix="/api/v1/parent/me/notices",
    tags=["parent / notices"],
)
app.include_router(
    teacher_auth.router,
    prefix="/api/v1/teacher/auth",
    tags=["teacher / auth"],
)
app.include_router(
    teacher_dashboard.router,
    prefix="/api/v1/teacher/dashboard",
    tags=["teacher / dashboard"],
)
app.include_router(
    teacher_my_classes.router,
    prefix="/api/v1/teacher",
    tags=["teacher / my classes"],
)
app.include_router(
    teacher_attendance.router,
    prefix="/api/v1/teacher/attendance",
    tags=["teacher / attendance"],
)
app.include_router(
    teacher_timetable.router,
    prefix="/api/v1/teacher/timetable",
    tags=["teacher / timetable"],
)
app.include_router(
    staff_attendance_routes.router,
    prefix="/api/v1/staff/attendance",
    tags=["staff / attendance"],
)
app.include_router(
    teacher_homework.router,
    prefix="/api/v1/teacher/homework",
    tags=["teacher / homework"],
)
app.include_router(
    parent_homework.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / homework"],
)
app.include_router(
    teacher_behaviour.router,
    prefix="/api/v1/teacher/behaviour",
    tags=["teacher / behaviour"],
)
app.include_router(
    teacher_marks.router,
    prefix="/api/v1/teacher/marks",
    tags=["teacher / marks"],
)
app.include_router(
    parent_behaviour.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / behaviour"],
)
app.include_router(
    school_staff_attendance.router,
    prefix="/api/v1/school/staff-attendance",
    tags=["school / staff attendance"],
)
app.include_router(
    school_attendance_reports.router,
    prefix="/api/v1/school/reports/attendance",
    tags=["school / reports / attendance"],
)
app.include_router(
    principal_auth.router,
    prefix="/api/v1/principal/auth",
    tags=["principal / auth"],
)
app.include_router(
    principal_dashboard.router,
    prefix="/api/v1/principal/dashboard",
    tags=["principal / dashboard"],
)
app.include_router(
    school_approvals.router,
    prefix="/api/v1/school/approvals",
    tags=["school / approvals"],
)
app.include_router(
    principal_approvals.router,
    prefix="/api/v1/principal/approvals",
    tags=["principal / approvals"],
)
app.include_router(
    school_audit_log.router,
    prefix="/api/v1/school/audit-log",
    tags=["school / audit log"],
)
app.include_router(
    school_fee_reminders.router,
    prefix="/api/v1/school/fees/reminders",
    tags=["school / fees / reminders"],
)
app.include_router(
    staff_leaves_routes.router,
    prefix="/api/v1/staff/leaves",
    tags=["staff / leaves"],
)
app.include_router(
    school_staff_leaves.router,
    prefix="/api/v1/school/staff-leaves",
    tags=["school / staff leaves"],
)
app.include_router(
    teacher_projects.router,
    prefix="/api/v1/teacher/projects",
    tags=["teacher / projects"],
)
app.include_router(
    parent_projects.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / projects"],
)
app.include_router(
    teacher_weekly_reports.router,
    prefix="/api/v1/teacher/weekly-reports",
    tags=["teacher / weekly reports"],
)
app.include_router(
    parent_weekly_reports.router,
    prefix="/api/v1/parent/me/children",
    tags=["parent / weekly reports"],
)
app.include_router(
    parent_messages.router,
    prefix="/api/v1/parent/me",
    tags=["parent / messages"],
)
app.include_router(
    teacher_messages.router,
    prefix="/api/v1/teacher",
    tags=["teacher / messages"],
)
app.include_router(
    school_exports.router,
    prefix="/api/v1/school/exports",
    tags=["school / exports"],
)
app.include_router(
    accountant_auth.router,
    prefix="/api/v1/accountant/auth",
    tags=["accountant / auth"],
)


@app.get("/")
def root():
    return {"app": settings.app_name, "env": settings.env, "docs": "/docs"}
