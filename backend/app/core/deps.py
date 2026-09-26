from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.security import decode_token
from app.database import get_db
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/super-admin/auth/login", auto_error=True
)


def get_current_user(
    request: Request,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type"
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload"
        )

    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Story 22.1 — stash the active actor directly on the SQLAlchemy session.
    # More reliable than ContextVar across FastAPI's threadpool boundaries.
    db.info["audit_actor"] = {
        "user_id": user.id,
        "tenant_id": user.tenant_id,
        "school_id": user.school_id,
        "request_path": request.url.path if request else None,
        "request_method": request.method if request else None,
    }
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_super_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required"
        )
    return current_user


SuperAdminUser = Annotated[User, Depends(require_super_admin)]


def require_school_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.school_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="School admin access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School admin must be linked to a tenant and school",
        )
    return current_user


SchoolAdminUser = Annotated[User, Depends(require_school_admin)]


def require_parent(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.parent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Parent access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent must be linked to a tenant and school",
        )
    return current_user


ParentUser = Annotated[User, Depends(require_parent)]


def require_student(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Student access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student must be linked to a tenant and school",
        )
    return current_user


StudentUser = Annotated[User, Depends(require_student)]

def require_teacher(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher must be linked to a tenant and school",
        )
    return current_user


TeacherUser = Annotated[User, Depends(require_teacher)]


def require_school_staff(current_user: CurrentUser) -> User:
    """Any employee that performs check-in/check-out: teacher, non-teaching
    staff, principal, or accountant."""
    if current_user.role not in (
        UserRole.teacher,
        UserRole.staff,
        UserRole.principal,
        UserRole.accountant,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff must be linked to a tenant and school",
        )
    return current_user


StaffUser = Annotated[User, Depends(require_school_staff)]


def require_principal(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.principal:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Principal access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Principal must be linked to a tenant and school",
        )
    return current_user


PrincipalUser = Annotated[User, Depends(require_principal)]


def require_accountant(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.accountant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Accountant access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accountant must be linked to a tenant and school",
        )
    return current_user


AccountantUser = Annotated[User, Depends(require_accountant)]


def require_school_admin_or_principal(current_user: CurrentUser) -> User:
    """Spec 3.2: principal can access reports. School admin can do everything
    a principal can, so reuse the same endpoints."""
    if current_user.role not in (UserRole.school_admin, UserRole.principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School admin or principal access required",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


SchoolAdminOrPrincipal = Annotated[
    User, Depends(require_school_admin_or_principal)
]


def require_school_admin_or_accountant(current_user: CurrentUser) -> User:
    """Spec 3.2: accountant can access only the fee module."""
    if current_user.role not in (UserRole.school_admin, UserRole.accountant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School admin or accountant access required",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


SchoolAdminOrAccountant = Annotated[
    User, Depends(require_school_admin_or_accountant)
]


def require_school_structure_reader(current_user: CurrentUser) -> User:
    """Read-only access to the school's classes and subjects. Principals,
    teachers, accountants and staff need them to pick a class or subject on
    their own screens; changing them stays with the school admin."""
    if current_user.role not in (
        UserRole.school_admin,
        UserRole.principal,
        UserRole.teacher,
        UserRole.accountant,
        UserRole.staff,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School staff access required",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


SchoolStructureReader = Annotated[
    User, Depends(require_school_structure_reader)
]


def require_front_desk(
    current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> User:
    """Gate / reception work: school admin, principal, or anyone whose roles
    carry frontdesk.manage (the built-in staff role does, until a school
    takes it off in the permission matrix)."""
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    if current_user.role in (UserRole.school_admin, UserRole.principal):
        return current_user
    from app.services import rbac_service

    if rbac_service.has_permission(db, current_user, "frontdesk.manage"):
        return current_user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Front desk access required")


FrontDeskUser = Annotated[User, Depends(require_front_desk)]


def allow(*roles: UserRole, permission: Optional[str] = None, any_of: tuple[str, ...] = ()):
    """Dependency for 'one of these roles, or anyone granted this permission'
    (or any of `any_of`, for lookups several jobs need).

    Permissions are additive, so existing role checks keep working and a school
    can delegate a job by giving someone a custom role.
    """
    wanted = ((permission,) if permission else ()) + tuple(any_of)

    def _check(
        current_user: CurrentUser,
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        if current_user.school_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School access required")
        if current_user.role in roles:
            return current_user
        if wanted:
            from app.services import rbac_service

            held = rbac_service.permissions_for(db, current_user)
            if any(p in held for p in wanted):
                return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this")

    return _check


def allow_job(*roles: UserRole, permission: str, also: tuple[str, ...] = ()):
    """Like `allow`, but the permission only widens access for the staff and
    teachers given the job: the listed roles keep exactly what they have, so a
    principal (whose built-in permissions include many jobs) gains nothing
    from it."""
    wanted = (permission,) + tuple(also)

    def _check(
        current_user: CurrentUser,
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        if current_user.school_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School access required")
        if current_user.role in roles:
            return current_user
        from app.services import rbac_service

        if rbac_service.holds_job(db, current_user, *wanted):
            return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this")

    return _check


# ---------- staff jobs ----------
# Each job's screens are the school admin's plus anyone whose roles carry the
# job's permission (a librarian, a transport manager…), so a school gives a
# person a job by giving them a role in the permission matrix.

LibraryManager = Annotated[User, Depends(allow(UserRole.school_admin, permission="library.manage"))]
TransportManager = Annotated[User, Depends(allow(UserRole.school_admin, permission="transport.manage"))]
# The clinic: the office, or the school nurse given the Health & clinic job
# (the same rule as the wellbeing screens).
HealthStaff = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="health.manage"))]
AdmissionsWorker = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="admissions.manage"))]
HrManager = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="hr.manage"))]
InventoryManager = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.accountant, permission="inventory.manage"))]
PayrollManager = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.accountant, permission="payroll.manage"))]

# Looking a student up (to issue a book, put them on a bus, give them a bed,
# let them out at the gate) is part of several jobs.
STUDENT_LOOKUP_JOBS = (
    "students.manage", "library.manage", "transport.manage", "hostel.manage",
    "frontdesk.manage", "admissions.manage", "inventory.manage", "health.manage",
)
StudentLookup = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, any_of=STUDENT_LOOKUP_JOBS))
]

# Lookups and reports that belong to a job as well as to the office.
HostelManager = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="hostel.manage"))]
FeeHeadReader = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.accountant, any_of=("fees.manage", "library.manage", "hostel.manage")))
]
HostelFeeRaiser = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.accountant, any_of=("fees.manage", "hostel.manage")))
]
LibraryReports = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="library.manage"))]
AssetKeeper = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, UserRole.accountant, permission="inventory.manage"))
]
StaffDirectoryReader = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, any_of=("staff.manage", "hr.manage")))
]
PublicLinkReader = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, any_of=("admissions.manage", "hr.manage")))
]
# Keeping the student roll: the office, and anyone a school delegates it to
# (a coordinator, an admissions clerk, a teacher who also runs the office).
StudentManager = Annotated[
    User, Depends(allow(UserRole.school_admin, permission="students.manage"))
]
# Parent logins and who they are linked to: the office, or whoever keeps the roll.
ParentManager = Annotated[
    User, Depends(allow(UserRole.school_admin, any_of=("parents.manage", "students.manage")))
]
# Reading a timetable is part of arranging cover; building it stays the office's.
TimetableReader = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, any_of=("cover.manage", "settings.manage")))
]
# Anyone the school lets see its reports; writing a report definition is separate.
ReportReader = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, UserRole.accountant, permission="reports.view"))
]

# ---------- examinations ----------
# The office (and, where it already could, the principal) keeps its access;
# staff or teachers given the Examinations job gain what the job describes.
# Signing off and publishing results needs exams.approve_results as well, so
# marks are never signed off just for having entered them.
ExamStaff = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="exams.manage"))]
ExamSetup = Annotated[User, Depends(allow_job(UserRole.school_admin, permission="exams.manage"))]
ResultApprover = Annotated[
    User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="exams.approve_results"))
]
GradingSetup = Annotated[User, Depends(allow_job(UserRole.school_admin, permission="grading.manage"))]

# ---------- academics, timetable cover ----------
# Reading the curricula and co-curricular activities: the office, or whoever
# holds the Academics job (syllabus.manage).
AcademicsReader = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="syllabus.manage"))]
# Arranging cover: the office, or whoever holds the Timetable & cover job.
CoverManager = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="cover.manage"))]
# The attendance office: the office, or whoever holds the job (attendance.correct).
AttendanceOffice = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="attendance.correct"))]

# ---------- office jobs on the school's records ----------
# The fee counter (fees.collect): fee records, recording payments, dues.
FeeCounter = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.accountant, permission="fees.collect"))]
# Outstanding dues by age: the reports readers, and the fee counter.
DuesReader = Annotated[User, Depends(allow_job(
    UserRole.school_admin, UserRole.principal, UserRole.accountant, permission="fees.collect", also=("reports.view",)))]
# The refund list: finance, and whoever requests or approves refunds as a job.
RefundReader = Annotated[User, Depends(allow_job(
    UserRole.school_admin, UserRole.accountant, UserRole.principal,
    permission="fees.refund.approve", also=("fees.refund.request",)))]
# Staff records (staff.manage). A job holder adds and edits teachers and
# office staff only, never the office roles (see api/v1/school/staff.py).
StaffManager = Annotated[User, Depends(allow_job(UserRole.school_admin, permission="staff.manage"))]
StaffRecordReader = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="staff.manage"))]
# Student records (students.manage): student logins, leavers, enrolments.
StudentRecords = Annotated[User, Depends(allow_job(UserRole.school_admin, permission="students.manage"))]
StudentRecordReader = Annotated[User, Depends(allow_job(UserRole.school_admin, UserRole.principal, permission="students.manage"))]
# The office's notices (notices.send given to office staff as a job).
NoticeWriter = Annotated[User, Depends(allow_job(UserRole.school_admin, permission="notices.send"))]
# The school's profile (its code and working week), read by the student records
# and attendance office jobs' screens.
ProfileReader = Annotated[User, Depends(allow_job(
    UserRole.school_admin, permission="students.manage", also=("attendance.correct",)))]
# Events and the photo gallery (events.manage, given to office staff as a job).
EventsManager = Annotated[User, Depends(allow_job(UserRole.school_admin, permission="events.manage"))]
# Parents' requests to change their contact details (parents.manage: no built-in role holds it).
ParentsManager = Annotated[User, Depends(allow(UserRole.school_admin, permission="parents.manage"))]
