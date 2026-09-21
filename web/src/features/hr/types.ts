// Shapes returned by /api/v1/school/{hr,hr-ops,ops,staff-leaves,staff-attendance,payroll}.

export type Department = { id: number; name: string; code: string; is_active: boolean; head_name: string | null; staff_count: number };

/** /api/v1/school/directory/staff: everyone who can sit on a panel. */
export type DirectoryPerson = { user_id: number; full_name: string; role: string };

/** /api/v1/school/staff */
export type StaffMember = {
  id: number;
  user_id: number;
  employee_no: string;
  designation: string | null;
  joining_date: string | null;
  department_id: number | null;
  department_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
};

// ----- recruitment -----

export type RequisitionStatus = "draft" | "submitted" | "approved" | "rejected" | "filled" | "cancelled";

export type Requisition = {
  id: number;
  title: string;
  department_id: number | null;
  department_name: string | null;
  role_description: string | null;
  headcount: number;
  reason: string;
  status: RequisitionStatus;
  raised_by_user_id: number | null;
  raised_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  needed_by: string | null;
  created_at: string;
};

export type OpeningStatus = "draft" | "open" | "on_hold" | "closed" | "filled";

export type Opening = {
  id: number;
  reference_no: string;
  title: string;
  department_id: number | null;
  department_name: string | null;
  employment_type: string;
  vacancies: number;
  description: string | null;
  requirements: string | null;
  salary_min: string | null;
  salary_max: string | null;
  status: OpeningStatus;
  is_public: boolean;
  posted_on: string | null;
  closes_on: string | null;
  applications: number;
  hired: number;
};

export type Interview = {
  id: number;
  round_no: number;
  scheduled_at: string;
  minutes: number;
  mode: string;
  place_or_link: string | null;
  panel_user_ids: number[];
  panel_names: string[];
  status: "scheduled" | "done" | "cancelled" | "no_show";
  feedback: string | null;
  rating: number | null;
  recommended: boolean | null;
};

export type OfferStatus = "draft" | "sent" | "accepted" | "declined" | "withdrawn" | "expired";

export type Offer = {
  id: number;
  role_title: string;
  annual_salary: string;
  joining_date: string;
  valid_till: string | null;
  status: OfferStatus;
  terms: string | null;
  sent_at: string | null;
  responded_at: string | null;
  response_note: string | null;
};

export type Stage = "applied" | "screening" | "shortlisted" | "interview" | "offered" | "hired" | "rejected" | "withdrawn";

export type Application = {
  id: number;
  opening_id: number;
  opening_title: string;
  candidate_id: number;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  qualification: string | null;
  experience_years: string | null;
  has_resume: boolean;
  applied_on: string;
  stage: Stage;
  rating: number | null;
  notes: string | null;
  rejected_reason: string | null;
  hired_staff_id: number | null;
  interviews: Interview[];
  offer: Offer | null;
};

/** /api/v1/school/ops/interviews: every interview in a window, one query. */
export type InterviewSlot = {
  interview_id: number;
  application_id: number;
  candidate_name: string | null;
  candidate_email: string | null;
  opening_title: string | null;
  round_no: number;
  scheduled_at: string;
  minutes: number;
  mode: string | null;
  place_or_link: string | null;
};

export type InterviewWindow = { from_date: string; to_date: string; interviews: InterviewSlot[]; count: number };

// ----- onboarding -----

export type Starter = {
  staff_id: number;
  employee_no: string | null;
  full_name: string | null;
  designation: string | null;
  joining_date: string | null;
  total: number;
  done: number;
  outstanding: number;
  overdue: number;
  percent: number;
};

export type OnboardingTask = {
  id: number;
  staff_id: number;
  title: string;
  area: string;
  is_done: boolean;
  done_by: string | null;
  done_at: string | null;
  due_on: string | null;
  note: string | null;
};

export type Checklist = Omit<Starter, "percent"> & { tasks: OnboardingTask[]; started: boolean; percent: number };

// ----- attendance and leave -----

export type AttendanceStatus = "present" | "late" | "absent" | "on_leave" | "sick" | "holiday";

export type StaffAttendance = {
  id: number;
  user_id: number;
  user_full_name: string | null;
  user_role: string | null;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus;
  manually_overridden: boolean;
  override_remark: string | null;
  override_by_user_id: number | null;
};

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type StaffLeave = {
  id: number;
  applicant_user_id: number;
  applicant_name: string | null;
  applicant_role: string | null;
  kind: string;
  leave_type_id: number | null;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decided_by_user_id: number | null;
  decided_by_name: string | null;
  decision_remark: string | null;
  decided_at: string | null;
  created_at: string;
};

export type LeaveType = {
  id: number;
  name: string;
  code: string;
  kind: string;
  annual_days: string;
  is_paid: boolean;
  carry_forward_max: string;
  document_after_days: number | null;
  is_active: boolean;
};

// ----- payroll -----

export type RunStatus = "draft" | "finalized" | "paid";

export type Run = {
  id: number;
  period: string;
  status: RunStatus;
  staff_count: number;
  total_gross: string;
  total_deductions: string;
  total_net: string;
  total_employer_cost: string;
  skipped_without_salary: string[];
  finalized_at: string | null;
  paid_on: string | null;
  payment_ref: string | null;
  created_at: string;
};

export type Payslip = {
  id: number;
  run_id: number;
  period: string;
  run_status: RunStatus;
  staff_id: number;
  full_name: string;
  employee_no: string;
  designation: string | null;
  days_in_month: number;
  lop_days: string;
  lop_days_auto: string;
  paid_days: string;
  basic: string;
  da: string;
  hra: string;
  conveyance: string;
  special_allowance: string;
  other_allowance: string;
  bonus: string;
  gross: string;
  pf_employee: string;
  esi_employee: string;
  professional_tax: string;
  tds: string;
  other_deduction: string;
  total_deductions: string;
  net_pay: string;
  pf_employer: string;
  esi_employer: string;
  remarks: string | null;
};

export type RunDetail = Run & { payslips: Payslip[] };

export type Salary = {
  id: number;
  staff_id: number;
  effective_from: string;
  basic: string;
  da: string;
  hra: string;
  conveyance: string;
  special_allowance: string;
  other_allowance: string;
  pf_applicable: boolean;
  esi_applicable: boolean;
  professional_tax: string | null;
  tds_monthly: string;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  pan: string | null;
  uan: string | null;
  monthly_gross: string;
};

export type StaffPayRow = {
  staff_id: number;
  user_id: number;
  full_name: string;
  employee_no: string;
  designation: string | null;
  is_active: boolean;
  salary: Salary | null;
};

export type PayrollSettings = {
  pf_employee_rate: string;
  pf_employer_rate: string;
  pf_wage_ceiling: string;
  esi_employee_rate: string;
  esi_employer_rate: string;
  esi_gross_ceiling: string;
  default_professional_tax: string;
};
