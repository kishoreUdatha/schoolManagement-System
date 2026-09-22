// Shapes returned by the employee self-service portal (/api/v1/staff/*).

export type AttendanceStatus = "present" | "late" | "absent" | "on_leave" | "sick" | "holiday";

/** GET /staff/attendance/today */
export type StaffToday = {
  date: string;
  has_record: boolean;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus | null;
  is_holiday: boolean;
  holiday_name: string | null;
  school_start_time: string | null;
  manually_overridden: boolean;
  override_remark: string | null;
};

/** StaffAttendanceRead (check-in, check-out, history rows) */
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

/** GET /staff/attendance/history?year=&month= */
export type MonthHistory = {
  year: number;
  month: number;
  summary: { total_days: number; present: number; late: number; absent: number; on_leave: number; sick: number; holiday: number };
  records: StaffAttendance[];
};

export type LeaveKind = "casual" | "sick" | "earned" | "unpaid" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

/** StaffLeaveRead */
export type StaffLeave = {
  id: number;
  applicant_user_id: number;
  applicant_name: string | null;
  applicant_role: string | null;
  kind: LeaveKind;
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

/** GET /staff/leaves/types */
export type LeaveType = {
  id: number;
  name: string;
  code: string;
  kind: LeaveKind;
  annual_days: string;
  is_paid: boolean;
  carry_forward_max: string;
  document_after_days: number | null;
  is_active: boolean;
};

/** GET /staff/leaves/balances (decimals arrive as strings) */
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

/** GET /staff/payslips (money and decimals arrive as strings) */
export type Payslip = {
  id: number;
  run_id: number;
  period: string;
  run_status: "draft" | "finalized" | "paid";
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

/** GET /staff/library (LoanRead) */
export type Loan = {
  id: number;
  copy_id: number;
  accession_no: string;
  book_id: number;
  title: string;
  borrower_type: string;
  student_id: number | null;
  user_id: number | null;
  borrower_name: string;
  borrower_detail: string | null;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  lost_on: string | null;
  renew_count: number;
  overdue_days: number;
  fine_amount: string;
  accruing_fine: string;
  fine_status: "none" | "pending" | "billed" | "paid" | "waived";
  fine_note: string | null;
};
