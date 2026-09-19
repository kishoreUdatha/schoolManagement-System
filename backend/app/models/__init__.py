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
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.fee_reminder import FeeReminderLog
from app.models.holiday import Holiday
from app.models.homework import Homework, HomeworkSubmission
from app.models.learning_video import LearningVideo, LearningVideoCompletion
from app.models.mark import Mark
from app.models.messaging import Conversation, Message
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
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
    "ClassSubject",
    "Conversation",
    "Exam",
    "ExamSubject",
    "FeeHead",
    "FeeReminderLog",
    "FeeStructure",
    "Holiday",
    "Homework",
    "HomeworkSubmission",
    "LearningVideo",
    "LearningVideoCompletion",
    "Mark",
    "Message",
    "Notice",
    "NoticeRecipient",
    "ParentStudent",
    "Period",
    "Plan",
    "PlanModule",
    "Project",
    "ProjectProgress",
    "School",
    "SchoolClass",
    "Section",
    "Staff",
    "StaffAttendance",
    "StaffLeave",
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
    "WeeklyReport",
]
