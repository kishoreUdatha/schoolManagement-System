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
};

export type Payslip = {
  id: number;
  run_id: number;
  period: string;
  run_status: RunStatus;
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

export const runTone = { draft: "amber", finalized: "brand", paid: "emerald" } as const;

export function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
