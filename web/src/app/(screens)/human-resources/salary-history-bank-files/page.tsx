// NEW-062 · Salary History & Bank Files
// Module: HR / Leave / Payroll · Role: HR Manager · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/payroll/staff, /payroll/staff/{staff_id}/salaries (?id=), /payroll/runs, /payroll/runs/{id}, /payroll/payslips/{id}/pdf, /payroll/runs/{run_id}/bank-file.csv. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SalaryHistory } from "@/features/hr/SalaryHistory";
import { routeOf } from "@/lib/screens";

export const metadata = { title: "NEW-062 · Salary History & Bank Files · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-062"
      actions={
        <Link href={routeOf(184)} className="btn primary">
          <Icon name="money" className="sm" />
          Payroll processing
        </Link>
      }
    >
      <Suspense>
        <SalaryHistory />
      </Suspense>
    </AppShell>
  );
}
