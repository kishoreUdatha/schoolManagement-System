from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.admission import (
    AdmissionActivity,
    AdmissionCampaign,
    AdmissionEnquiry,
)
from app.models.approval import ApprovalRequest
from app.models.audit import AuditLog
from app.models.attendance import StudentAttendance
from app.models.behaviour import BehaviourRating
from app.models.document import (
    CertificateIssue,
    CertificateSequence,
    CertificateTemplate,
    Document,
)
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.fee_reminder import FeeReminderLog
from app.models.health import ClinicVisit, HealthCheckup, Immunization, MedicalProfile
from app.models.holiday import Holiday
from app.models.hostel import (
    Hostel,
    HostelAllocation,
    HostelAttendance,
    HostelBed,
    HostelComplaint,
    HostelOuting,
    HostelRoom,
    MessMenu,
)
from app.models.homework import Homework, HomeworkSubmission
from app.models.learning_video import LearningVideo, LearningVideoCompletion
from app.models.library import Book, BookCopy, LibrarySettings, Loan, Reservation
from app.models.mark import Mark
from app.models.messaging import Conversation, Message
from app.models.notice import Notice, NoticeRecipient
from app.models.online_payment import (
    FeePaymentOrder,
    FeePaymentOrderItem,
    SchoolPaymentGateway,
)
from app.models.parent import ParentStudent
from app.models.payroll import PayrollRun, PayrollSettings, Payslip, StaffSalary
from app.models.plan import Plan, PlanModule
from app.models.project import Project, ProjectProgress
from app.models.staff import Staff
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.subscription import SubscriptionPayment, TenantSubscription
from app.models.tenant import School, Tenant
from app.models.timetable import Period, TimetableEntry
from app.models.transport import (
    TransportAssignment,
    TransportCrew,
    TransportRoute,
    TransportStop,
    Trip,
    TripBoarding,
    Vehicle,
    VehicleLocation,
    VehicleLog,
)
from app.models.usage import TenantUsage
from app.models.visitor import GatePass, SecurityIncident, Visit
from app.models.user import User, UserOtp
from app.models.weekly_report import WeeklyReport

__all__ = [
    "AcademicYear",
    "AdmissionActivity",
    "AdmissionCampaign",
    "AdmissionEnquiry",
    "ApprovalRequest",
    "AuditLog",
    "BehaviourRating",
    "Book",
    "BookCopy",
    "CertificateIssue",
    "CertificateSequence",
    "CertificateTemplate",
    "ClassSubject",
    "ClinicVisit",
    "Conversation",
    "Document",
    "Exam",
    "ExamSubject",
    "FeeHead",
    "FeeReminderLog",
    "FeePaymentOrder",
    "FeePaymentOrderItem",
    "FeeStructure",
    "GatePass",
    "HealthCheckup",
    "Holiday",
    "Homework",
    "Hostel",
    "HostelAllocation",
    "HostelAttendance",
    "HostelBed",
    "HostelComplaint",
    "HostelOuting",
    "HostelRoom",
    "Immunization",
    "HomeworkSubmission",
    "LearningVideo",
    "LearningVideoCompletion",
    "LibrarySettings",
    "Loan",
    "Mark",
    "MedicalProfile",
    "Message",
    "MessMenu",
    "Notice",
    "NoticeRecipient",
    "ParentStudent",
    "PayrollRun",
    "PayrollSettings",
    "Payslip",
    "Period",
    "Plan",
    "PlanModule",
    "Reservation",
    "Project",
    "ProjectProgress",
    "School",
    "SchoolPaymentGateway",
    "SecurityIncident",
    "SchoolClass",
    "Section",
    "Staff",
    "StaffAttendance",
    "StaffLeave",
    "StaffSalary",
    "Student",
    "StudentAttendance",
    "StudentFee",
    "Subject",
    "SubscriptionPayment",
    "Tenant",
    "TenantSubscription",
    "TimetableEntry",
    "TransportAssignment",
    "TransportCrew",
    "TransportRoute",
    "TransportStop",
    "Trip",
    "TripBoarding",
    "Vehicle",
    "VehicleLocation",
    "VehicleLog",
    "TenantUsage",
    "User",
    "UserOtp",
    "Visit",
    "WeeklyReport",
]
