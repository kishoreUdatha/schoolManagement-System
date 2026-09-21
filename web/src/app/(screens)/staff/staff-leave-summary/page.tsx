// SCR-089 · Staff Leave Summary
// Module: Teachers & Staff · Role: School Admin · Release: Phase 3 · Stories: US-0177 / US-0178
// Mock: screens/SCR-089_Staff_Leave_Summary.html
// Wired: GET /api/v1/school/staff-leaves (status), POST /staff-leaves/{id}/decide, GET /hr/leave-balances (year). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StaffLeaveSummary } from "@/features/staff/StaffLeaveSummary";

export const metadata = { title: "SCR-089 · Staff Leave Summary · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-089">
      <Suspense>
        <StaffLeaveSummary />
      </Suspense>
    </AppShell>
  );
}
