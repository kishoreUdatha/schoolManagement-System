// SCR-183 · Payroll Setup
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0365 / US-0366
// Mock: screens/SCR-183_Payroll_Setup.html
// Backend: the old frontend served this at /school/payroll — Salary structure plus statutory rates
// Wired: GET /api/v1/school/payroll/staff, PUT /payroll/staff/{id}/salary (?id= staff), GET/PATCH /payroll/settings. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PayrollSetup } from "@/features/hr/PayrollSetup";

export const metadata = { title: "SCR-183 · Payroll Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-183" actions={<button type="submit" form="payroll-setup" className="btn primary">
        <Icon name="check" className="sm" />
        Save payroll setup
      </button>}>
      <Suspense>
        <PayrollSetup />
      </Suspense>
    </AppShell>
  );
}
