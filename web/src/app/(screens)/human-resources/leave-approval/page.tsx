// SCR-182 · Leave Approval
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0363 / US-0364
// Mock: screens/SCR-182_Leave_Approval.html
// Backend: the old frontend served this at /school/staff-leaves — Decide on the list; no approver queue (in a tab, complete)
// Wired: GET /api/v1/school/staff-leaves, POST /staff-leaves/{id}/decide, GET /hr/leave-types, /hr/leave-balances?year=&user_id=. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LeaveApproval } from "@/features/hr/LeaveApproval";

export const metadata = { title: "SCR-182 · Leave Approval · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-182" actions={<button type="submit" form="leave-decision" className="btn primary">
        <Icon name="check" className="sm" />
        Approve request
      </button>}>
      <Suspense>
        <LeaveApproval />
      </Suspense>
    </AppShell>
  );
}
