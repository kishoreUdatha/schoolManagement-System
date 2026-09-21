// SCR-185 · Payslip & Payroll History
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0369 / US-0370
// Mock: screens/SCR-185_Payslip_Payroll_History.html
// Backend: the old frontend served this at /school/payroll — Payslip PDF and month history
// Wired: GET /api/v1/school/payroll/runs, /payroll/runs/{id} (?run=, ?id= payslip), GET /payroll/payslips/{id}/pdf. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PayslipDownload, Payslips } from "@/features/hr/Payslips";

export const metadata = { title: "SCR-185 · Payslip & Payroll History · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-185" actions={<Suspense><PayslipDownload /></Suspense>}>
      <Suspense>
        <Payslips />
      </Suspense>
    </AppShell>
  );
}
