/** GET /api/v1/school/approvals, /api/v1/principal/approvals (ApprovalRead). */

export type ApprovalKind = "marks_correction" | "attendance_edit" | "staff_leave" | "result_publishing" | "fee_waiver" | "payroll_run";

/** Kinds the system files by itself (a big waiver, a finalised payroll); nobody files them by hand. */
export const SYSTEM_KINDS: ApprovalKind[] = ["fee_waiver", "payroll_run"];
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type Approval = {
  id: number;
  kind: ApprovalKind;
  status: ApprovalStatus;
  requested_by_user_id: number | null;
  requested_by_name: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  reviewed_by_user_id: number | null;
  reviewed_by_name: string | null;
  decision_remark: string | null;
  decided_at: string | null;
  created_at: string;
};

export const KIND_LABEL: Record<ApprovalKind, string> = {
  marks_correction: "Marks correction",
  attendance_edit: "Attendance edit",
  staff_leave: "Staff leave",
  result_publishing: "Result publishing",
  fee_waiver: "Fee waiver",
  payroll_run: "Payroll",
};

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** What approving does, per kind (approval_service._apply). */
export const KIND_EFFECT: Record<ApprovalKind, string> = {
  result_publishing: "Approving publishes the exam's results to parents and students straight away.",
  marks_correction: "Approving records the decision; the teacher then changes the mark in marks entry.",
  attendance_edit: "Approving records the decision; the register is then corrected in attendance.",
  staff_leave: "Approving records the decision; leave itself is handled under HR leave requests.",
  fee_waiver: "Approving writes the fee off at once, with the accountant's reason on it. Rejecting leaves it due.",
  payroll_run: "Approving lets the accountant mark this payroll paid. Rejecting keeps it unpaid; they can reopen and correct it.",
};

export type Exam = { id: number; name: string; academic_year_name?: string | null; is_published?: boolean };
