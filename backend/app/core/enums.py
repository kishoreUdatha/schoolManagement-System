import enum


class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    school_admin = "school_admin"
    teacher = "teacher"
    parent = "parent"
    staff = "staff"
    student = "student"
    principal = "principal"
    accountant = "accountant"


class TenantStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    deleted = "deleted"


class SchoolStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class PlanTier(str, enum.Enum):
    basic = "basic"
    standard = "standard"
    premium = "premium"


class SubscriptionStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    expired = "expired"
    cancelled = "cancelled"


class PaymentMode(str, enum.Enum):
    razorpay = "razorpay"
    manual = "manual"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"
    refunded = "refunded"


class BillingCycle(str, enum.Enum):
    monthly = "monthly"
    yearly = "yearly"


class SubjectKind(str, enum.Enum):
    core = "core"
    elective = "elective"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class ParentRelation(str, enum.Enum):
    father = "father"
    mother = "mother"
    guardian = "guardian"
    other = "other"


class FeeStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    waived = "waived"
    # 'overdue' is computed at read-time from due_date + status


class LateFeeType(str, enum.Enum):
    none = "none"
    percent = "percent"
    fixed = "fixed"


class HolidayType(str, enum.Enum):
    national = "national"
    school = "school"
    vacation = "vacation"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    late = "late"
    half_day = "half_day"


class SubmissionStatus(str, enum.Enum):
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class ApprovalKind(str, enum.Enum):
    marks_correction = "marks_correction"
    attendance_edit = "attendance_edit"
    staff_leave = "staff_leave"
    result_publishing = "result_publishing"


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"


class FeeReminderKind(str, enum.Enum):
    pre_due_7 = "pre_due_7"
    pre_due_1 = "pre_due_1"
    overdue_1 = "overdue_1"
    overdue_7 = "overdue_7"
    overdue_30 = "overdue_30"


class StaffAttendanceStatus(str, enum.Enum):
    present = "present"
    late = "late"
    absent = "absent"
    on_leave = "on_leave"
    sick = "sick"
    holiday = "holiday"


class StaffLeaveKind(str, enum.Enum):
    casual = "casual"
    sick = "sick"
    earned = "earned"
    unpaid = "unpaid"
    other = "other"


class StaffLeaveStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class ProjectKind(str, enum.Enum):
    individual = "individual"
    group = "group"


class ProjectProgressStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    submitted = "submitted"
    reviewed = "reviewed"


class BehaviourPeriodKind(str, enum.Enum):
    weekly = "weekly"
    monthly = "monthly"


class ExamKind(str, enum.Enum):
    unit_test = "unit_test"
    mid_term = "mid_term"
    term = "term"
    final = "final"
    other = "other"


class MarkStatus(str, enum.Enum):
    scored = "scored"
    absent = "absent"
    exempt = "exempt"


class NoticeAudience(str, enum.Enum):
    all_parents = "all_parents"
    all_teachers = "all_teachers"
    all_staff = "all_staff"  # teachers + non-teaching
    class_parents = "class_parents"  # parents of students in a specific class
    section_parents = "section_parents"  # parents of one section only
    single_parent = "single_parent"  # parents linked to one specific student


class NoticeChannel(str, enum.Enum):
    in_app = "in_app"
    email = "email"
    sms = "sms"
    whatsapp = "whatsapp"


class NoticeStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    sent = "sent"


class RecipientStatus(str, enum.Enum):
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"
    skipped = "skipped"


class ModuleKey(str, enum.Enum):
    attendance = "attendance"
    homework = "homework"
    exams = "exams"
    fees = "fees"
    behaviour = "behaviour"
    digital_learning = "digital_learning"
    ai_reports = "ai_reports"
    ai_chatbot = "ai_chatbot"
    whatsapp = "whatsapp"
    sms = "sms"


class AdmissionStage(str, enum.Enum):
    enquiry = "enquiry"
    contacted = "contacted"
    visit_scheduled = "visit_scheduled"
    visited = "visited"
    applied = "applied"
    test_scheduled = "test_scheduled"
    offered = "offered"
    enrolled = "enrolled"
    lost = "lost"


class AdmissionSource(str, enum.Enum):
    walk_in = "walk_in"
    website = "website"
    phone = "phone"
    referral = "referral"
    social_media = "social_media"
    advertisement = "advertisement"
    campaign = "campaign"
    other = "other"


class AdmissionActivityKind(str, enum.Enum):
    note = "note"
    call = "call"
    visit = "visit"
    email = "email"
    whatsapp = "whatsapp"
    stage_change = "stage_change"


class VehicleKind(str, enum.Enum):
    bus = "bus"
    mini_bus = "mini_bus"
    van = "van"
    car = "car"
    other = "other"


class CrewRole(str, enum.Enum):
    driver = "driver"
    conductor = "conductor"
    attendant = "attendant"


class VehicleLogKind(str, enum.Enum):
    fuel = "fuel"
    service = "service"
    repair = "repair"
    tyre = "tyre"
    insurance = "insurance"
    other = "other"


class TransportDirection(str, enum.Enum):
    both = "both"
    pickup = "pickup"
    drop = "drop"


class TripDirection(str, enum.Enum):
    pickup = "pickup"
    drop = "drop"


class TripStatus(str, enum.Enum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class BoardingStatus(str, enum.Enum):
    boarded = "boarded"
    dropped = "dropped"
    absent = "absent"


class OnlinePaymentStatus(str, enum.Enum):
    created = "created"
    paid = "paid"
    failed = "failed"


class DocumentOwner(str, enum.Enum):
    student = "student"
    staff = "staff"
    school = "school"


class DocumentCategory(str, enum.Enum):
    birth_certificate = "birth_certificate"
    aadhaar = "aadhaar"
    photo = "photo"
    address_proof = "address_proof"
    transfer_certificate = "transfer_certificate"
    previous_marksheet = "previous_marksheet"
    medical = "medical"
    caste_certificate = "caste_certificate"
    qualification = "qualification"
    experience = "experience"
    id_proof = "id_proof"
    policy = "policy"
    circular = "circular"
    other = "other"


class VerificationStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class CertificateKind(str, enum.Enum):
    bonafide = "bonafide"
    character = "character"
    transfer = "transfer"
    study = "study"
    fee_paid = "fee_paid"
    custom = "custom"


class CertificateStatus(str, enum.Enum):
    requested = "requested"
    issued = "issued"
    rejected = "rejected"
    cancelled = "cancelled"


class PayrollRunStatus(str, enum.Enum):
    draft = "draft"
    finalized = "finalized"
    paid = "paid"


class CopyStatus(str, enum.Enum):
    available = "available"
    issued = "issued"
    on_hold = "on_hold"  # set aside for a reservation
    lost = "lost"
    damaged = "damaged"
    withdrawn = "withdrawn"


class BorrowerType(str, enum.Enum):
    student = "student"
    staff = "staff"


class FineStatus(str, enum.Enum):
    none = "none"
    pending = "pending"
    billed = "billed"  # added to the student's fees
    paid = "paid"
    waived = "waived"


class ReservationStatus(str, enum.Enum):
    waiting = "waiting"
    ready = "ready"
    fulfilled = "fulfilled"
    cancelled = "cancelled"
    expired = "expired"


class ClinicOutcome(str, enum.Enum):
    back_to_class = "back_to_class"
    rested = "rested"
    sent_home = "sent_home"
    parent_picked_up = "parent_picked_up"
    referred_hospital = "referred_hospital"


class VisitPurpose(str, enum.Enum):
    meeting = "meeting"
    parent_visit = "parent_visit"
    admission_enquiry = "admission_enquiry"
    delivery = "delivery"
    vendor = "vendor"
    interview = "interview"
    event = "event"
    maintenance = "maintenance"
    other = "other"


class VisitStatus(str, enum.Enum):
    expected = "expected"
    checked_in = "checked_in"
    checked_out = "checked_out"
    denied = "denied"
    cancelled = "cancelled"


class GatePassStatus(str, enum.Enum):
    requested = "requested"
    approved = "approved"
    rejected = "rejected"
    departed = "departed"
    cancelled = "cancelled"


class IncidentSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
