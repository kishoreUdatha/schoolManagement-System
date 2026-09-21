// SCR-184 · Payroll Processing
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0367 / US-0368
// Mock: screens/SCR-184_Payroll_Processing.html
// Backend: the old frontend served this at /school/payroll/runs/[id] — Recalculate, finalise, adjust, bank file
// Wired: GET/POST /api/v1/school/payroll/runs, GET/DELETE /runs/{id} (?id=), POST /runs/{id}/recalculate, /finalize, /reopen, /paid, PATCH /runs/{id}/payslips/{slip}, GET /runs/{id}/bank-file.csv. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PayrollProcessing } from "@/features/hr/PayrollProcessing";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-184 · Payroll Processing · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-184" actions={<PageAction icon="check">Process payroll</PageAction>}>
      <Suspense>
        <PayrollProcessing />
      </Suspense>
    </AppShell>
  );
}
