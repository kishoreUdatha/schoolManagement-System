// Shapes returned by /api/v1/school/* for the Teachers & Staff module.

export type StaffRole = "teacher" | "staff" | "principal" | "accountant";

export const ROLE_LABEL: Record<StaffRole, string> = {
  teacher: "Teacher",
  staff: "Non-teaching staff",
  principal: "Principal",
  accountant: "Accountant",
};

/** GET /staff and GET /staff/{id}. */
export type Staff = {
  id: number;
  user_id: number;
  employee_no: string;
  designation: string | null;
  joining_date: string | null;
  department_id: number | null;
  department_name: string | null;
  created_at: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  last_login_at: string | null;
};

export type Department = { id: number; name: string; code?: string | null; is_active?: boolean };

export type Workload = {
  periods_per_week: number;
  subjects_taught: number;
  sections_taught: number;
  class_teacher_of: { section_id: number; label: string }[];
  subjects: { class_subject_id: number; subject_name: string; class_name: string | null }[];
  homework_set: number;
  marks_entered: number;
};

export type Qualification = {
  id: number;
  qualification: string;
  institution: string | null;
  year_awarded: number | null;
  subject_area: string | null;
  document_id?: number | null;
  document_title: string | null;
  verified_at: string | null;
  verified_by: string | null;
};

export type StaffDocument = {
  id: number;
  title: string;
  category: string;
  verification_status: string;
  expires_on: string | null;
  uploaded_at?: string;
};

export type Observation = {
  id: number;
  staff_id?: number;
  staff_name?: string | null;
  observed_on: string;
  observer_name: string | null;
  subject_name: string | null;
  section_label: string | null;
  focus: string | null;
  strengths: string | null;
  next_steps: string | null;
  follow_up_on?: string | null;
  shared_with_staff: boolean;
};

/** GET /staff-ops/{id}/profile. */
export type StaffProfile = {
  staff_id: number;
  user_id: number;
  employee_no: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  designation: string | null;
  joining_date: string | null;
  department_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  workload: Workload;
  qualifications: Qualification[];
  documents: StaffDocument[];
  recent_observations: Observation[];
  exit_clearance_id: number | null;
  exit_status: string | null;
};

/** GET /staff-ops/{id}/qualifications. */
export type QualificationsPage = {
  staff_id: number;
  full_name: string;
  employee_no: string;
  role: string;
  qualifications: Qualification[];
  unverified: number;
  documents: StaffDocument[];
};

/** GET /staff-ops/workload. */
export type WorkloadRow = Workload & {
  staff_id: number;
  user_id: number;
  employee_no: string;
  full_name: string;
  role: StaffRole;
  designation: string | null;
  department_name: string | null;
  is_active: boolean;
};
export type WorkloadReport = {
  staff: WorkloadRow[];
  count: number;
  teaching_count: number;
  median_periods: number | null;
  total_periods: number;
  without_timetable: number;
};

/** GET /staff-ops/attendance-summary. */
export type AttendanceRow = {
  user_id: number;
  name: string;
  role: string;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  sick: number;
  holiday: number;
  marked: number;
  percent: number;
};
export type AttendanceSummary = { year: number; month: number; from_date: string; to_date: string; working_days: number; staff: AttendanceRow[] };

/** GET /staff-leaves. */
export type StaffLeave = {
  id: number;
  applicant_user_id: number;
  applicant_name: string;
  applicant_role: string;
  kind: string;
  leave_type_id: number | null;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_by_name: string | null;
  decision_remark: string | null;
  decided_at: string | null;
  created_at: string;
};

/** GET /hr/leave-balances. Amounts arrive as decimal strings. */
export type LeaveBalance = {
  id: number;
  user_id: number;
  user_name: string;
  leave_type_id: number;
  leave_type_name: string;
  year: number;
  allotted: string;
  carried_forward: string;
  adjustment: string;
  used: string;
  available: string;
  note: string | null;
  is_paid: boolean;
};

export type ObservationsPage = { observations: Observation[]; count: number; unshared: number; follow_ups_due: number };

export type ClearanceItem = { id: number; area: string; is_cleared: boolean; cleared_by: string | null; cleared_at: string | null; note: string | null };
export type Clearance = {
  id: number;
  staff_id: number;
  staff_name: string | null;
  employee_no: string | null;
  last_working_day: string | null;
  reason: string | null;
  status: string;
  initiated_by: string | null;
  completed_at: string | null;
  items: ClearanceItem[];
  outstanding: string[];
  outstanding_count: number;
  can_complete: boolean;
  is_active: boolean | null;
};

export type ClassSubject = {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_user_id: number | null;
  is_optional: boolean;
  display_order: number;
  subject: { id: number; name: string; code: string | null; kind: string };
};

export type Subject = { id: number; name: string; code: string | null; kind: string; is_active: boolean };
