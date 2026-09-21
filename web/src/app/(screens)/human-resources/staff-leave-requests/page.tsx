// SCR-181 · Staff Leave Requests
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0361 / US-0362
// Mock: screens/SCR-181_Staff_Leave_Requests.html
// Backend: the old frontend served this at /school/staff-leaves — Pending and history across staff
// Wired: GET /api/v1/school/staff-leaves?status=, GET /hr/leave-types. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LeaveRequests } from "@/features/hr/LeaveRequests";

export const metadata = { title: "SCR-181 · Staff Leave Requests · BrightCampus" };

export default function Page() {
  return (
    // Not wired: "Request leave" — staff apply from their own portal (POST /api/v1/staff/leaves); the school API has no way to file leave for someone else.
    <AppShell screen="SCR-181" actions={<button type="button" className="btn" data-export="">
        <Icon name="download" className="sm" />
        Export
      </button>}>
      <Suspense>
        <LeaveRequests />
      </Suspense>
    </AppShell>
  );
}
