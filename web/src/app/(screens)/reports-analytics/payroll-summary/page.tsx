// SCR-277 · Payroll Summary
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0553 / US-0554
// Mock: screens/SCR-277_Payroll_Summary.html
// Wired: GET /api/v1/school/payroll/runs. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { PayrollSummary } from "@/features/reports/money";

export const metadata = { title: "SCR-277 · Payroll Summary · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-277" actions={<ExportButtons />}>
      <Suspense>
        <PayrollSummary />
      </Suspense>
    </AppShell>
  );
}
