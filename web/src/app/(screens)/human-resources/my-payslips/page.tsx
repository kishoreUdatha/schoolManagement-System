// NEW-092 · My Payslips
// Module: HR / Leave / Payroll · Role: Staff · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /staff/payslips and /teacher/payslips
// Wired: GET /api/v1/staff/payslips, GET /staff/payslips/{id}/pdf (api.open / api.download). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RoleGate } from "@/features/self/kit";
import { EMPLOYEES } from "@/features/self/roles";
import { MyPayslips } from "@/features/self/MyPayslips";

export const metadata = { title: "NEW-092 · My Payslips · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-092"
    >
      <RoleGate roles={EMPLOYEES} message="Payslips are for employees paid through the school payroll. Sign in with an employee login to see yours.">
        <Suspense>
          <MyPayslips />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
