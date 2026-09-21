// SCR-180 · Leave Policies
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0359 / US-0360
// Mock: screens/SCR-180_Leave_Policies.html
// Backend: the old frontend served this at /school/leave-entitlement — Days, carry forward, paid, proof
// Wired: GET/POST /api/v1/school/hr/leave-types, PUT/DELETE /hr/leave-types/{id} (?id=), POST /hr/leave-balances/allot. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LeavePolicies } from "@/features/hr/LeavePolicies";

export const metadata = { title: "SCR-180 · Leave Policies · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-180" actions={<button type="submit" form="leave-policy" className="btn primary">
        <Icon name="check" className="sm" />
        Save leave policy
      </button>}>
      <Suspense>
        <LeavePolicies />
      </Suspense>
    </AppShell>
  );
}
