from app.models.academics_ops import (
    Activity,
    ActivityMember,
    Curriculum,
    CurriculumSubject,
    SubjectGroup,
    SubjectGroupMember,
)
from app.models.hr_ops import OnboardingTask, Requisition
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.accounts import (
    Cheque,
    Concession,
    Expense,
    ExpenseCategory,
    FeeCollection,
    OtherIncome,
)
from app.models.admission import (
    AdmissionActivity,
    AdmissionCampaign,
    AdmissionEnquiry,
)
from app.models.application import (
    AdmissionApplication,
    AdmissionAssessment,
    ApplicationDocument,
    ApplicationStatusHistory,
)
from app.models.approval import ApprovalRequest
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.attendance_ops import (
    AbsenceContact,
    AttendanceCorrection,
    PeriodAttendance,
)
from app.models.attendance import StudentAttendance
from app.models.behaviour import BehaviourRating
from app.models.comms_settings import (
    NotificationPreference,
    NotificationTemplate,
    SecurityPolicy,
)
from app.models.cover import StudentLeave, Substitution, TeacherUnavailability
from app.models.document import (
    CertificateIssue,
    CertificateSequence,
    CertificateTemplate,
    Document,
)
from app.models.event_ops import EventAttendance
from app.models.events import (
    EventConsent,
    GalleryAlbum,
    GalleryPhoto,
    PtmSession,
    PtmSlot,
    SchoolEvent,
)
from app.models.exam import Exam, ExamSubject
from app.models.exam_ops import (
    ExamRoomAllocation,
    ExamSubjectComponent,
    Invigilation,
    MarkComponent,
)
from app.models.facility import Lab, LabBooking, Room
from app.models.fee_plan import StudentFeeAssignment
from app.models.purchasing import (
    PurchaseOrder,
    PurchaseOrderLine,
    VendorBill,
    VendorPayment,
)
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.fee_extra import LateFeeRule, Refund
from app.models.fee_reminder import FeeReminderLog
from app.models.foundation import (
    Department,
    Guardian,
    StudentEnrollment,
    StudentGuardian,
    Term,
)
from app.models.grading import (
    ExamType,
    GradeBand,
    GradeScale,
    ReportCardRemark,
    ReportCardSetting,
)
from app.models.health import ClinicVisit, HealthCheckup, Immunization, MedicalProfile
from app.models.holiday import Holiday
from app.models.hostel_ops import WardenDuty
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
from app.models.hr import (
    Candidate,
    CandidateApplication,
    InterviewSchedule,
    JobOpening,
    LeaveBalance,
    LeaveType,
    Offer,
)
from app.models.homework import Homework, HomeworkSubmission
from app.models.inventory import (
    Asset,
    AssetEvent,
    InventoryItem,
    StockMove,
    StoreSale,
    StoreSaleLine,
    Supplier,
)
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
from app.models.online_exam import (
    AttemptAnswer,
    OnlineTest,
    OnlineTestQuestion,
    Question,
    TestAttempt,
)
from app.models.parent import ParentNote, ParentStudent
from app.models.pastoral import (
    CounsellingCase,
    CounsellingSession,
    DisciplineAction,
    DisciplineIncident,
)
from app.models.datadesk import ExportJob, ImportJob, ReportDefinition
from app.models.curriculum import LearningOutcome, OutcomeTopic, TeachingResource
from app.models.payroll import PayrollRun, PayrollSettings, Payslip, StaffSalary
from app.models.platform import (
    GlobalAnnouncement,
    PlatformSetting,
    SupportTicket,
    TicketReply,
)
from app.models.plan import Plan, PlanModule
from app.models.project import Project, ProjectProgress
from app.models.rbac import Branch, Permission, Role, RolePermission, UserRoleAssignment
from app.models.result_override import ExamResultOverride
from app.models.rubric import Rubric, RubricCriterion, RubricScore
from app.models.register import AttendanceSession, Visitor
from app.models.staff_ops import (
    ClassroomObservation,
    ExitClearance,
    ExitClearanceItem,
    StaffQualification,
)
from app.models.staff import Staff
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.subscription import SubscriptionPayment, TenantSubscription
from app.models.tenant import School, Tenant
from app.models.syllabus import (
    LessonPlan,
    LessonPlanTopic,
    SyllabusChapter,
    SyllabusTopic,
    TopicCoverage,
)
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
from app.models.health_sample import HealthSample
from app.models.wellbeing import (
    CounsellingAppointment,
    EmergencyEscalation,
    FirstAidLog,
    MedicationAdministration,
)
from app.models.visitor import GatePass, SecurityIncident, Visit
from app.models.user import User, UserOtp
from app.models.weekly_report import WeeklyReport

__all__ = [
    "AcademicYear",
    "AdmissionActivity",
    "AdmissionCampaign",
    "AdmissionEnquiry",
    "ApprovalRequest",
    "Asset",
    "AssetEvent",
    "AuditLog",
    "BehaviourRating",
    "Book",
    "BookCopy",
    "CertificateIssue",
    "CertificateSequence",
    "CertificateTemplate",
    "Cheque",
    "ClassSubject",
    "ClinicVisit",
    "Concession",
    "Conversation",
    "Department",
    "Document",
    "Exam",
    "Expense",
    "ExpenseCategory",
    "ExamSubject",
    "FeeCollection",
    "FeeHead",
    "FeeReminderLog",
    "FeePaymentOrder",
    "FeePaymentOrderItem",
    "FeeStructure",
    "GatePass",
    "Guardian",
    "HealthCheckup",
    "Holiday",
    "Homework",
    "InventoryItem",
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
    "OtherIncome",
    "NoticeRecipient",
    "ParentNote",
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
    "StockMove",
    "StoreSale",
    "StoreSaleLine",
    "Student",
    "StudentAttendance",
    "StudentEnrollment",
    "StudentFee",
    "StudentGuardian",
    "Subject",
    "Supplier",
    "SubscriptionPayment",
    "Tenant",
    "Term",
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
    "AttendanceSession",
    "ExamResultOverride",
    "ExportJob",
    "ImportJob",
    "ReportDefinition",
    "Rubric",
    "RubricCriterion",
    "RubricScore",
    "LearningOutcome",
    "OutcomeTopic",
    "TeachingResource",
    "Visitor",
    "Lab",
    "LabBooking",
    "Room",
    "Branch",
    "Permission",
    "Role",
    "RolePermission",
    "UserRoleAssignment",
    "AdmissionApplication",
    "AdmissionAssessment",
    "ApplicationDocument",
    "ApplicationStatusHistory",
    "Candidate",
    "CandidateApplication",
    "InterviewSchedule",
    "JobOpening",
    "LeaveBalance",
    "LeaveType",
    "Offer",
    "CounsellingCase",
    "CounsellingSession",
    "DisciplineAction",
    "DisciplineIncident",
    "LateFeeRule",
    "Refund",
    "ExamType",
    "GradeBand",
    "GradeScale",
    "ReportCardRemark",
    "ReportCardSetting",
    "StudentLeave",
    "Substitution",
    "NotificationPreference",
    "NotificationTemplate",
    "SecurityPolicy",
    "TeacherUnavailability",
    "AttemptAnswer",
    "OnlineTest",
    "OnlineTestQuestion",
    "Question",
    "TestAttempt",
    "LessonPlan",
    "LessonPlanTopic",
    "SyllabusChapter",
    "SyllabusTopic",
    "TopicCoverage",
    "EventConsent",
    "GalleryAlbum",
    "GalleryPhoto",
    "PtmSession",
    "PtmSlot",
    "SchoolEvent",
    "WeeklyReport",
    "Attachment",
]

from app.models.parent_services import (  # noqa: E402,F401  parent services area
    CanteenMenu,
    HelpTicket,
    HelpTicketReply,
    ParentRequest,
    ParentServiceSettings,
    ProjectMilestone,
    StudentAchievement,
    Survey,
    SurveyResponse,
)

from app.models.whatsapp import SchoolWhatsappConfig, SchoolWhatsappTemplate  # noqa: E402,F401  per-school WhatsApp
