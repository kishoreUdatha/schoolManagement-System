// SCR-039 · HR Dashboard
// Module: Role Dashboards · Role: HR · Release: Phase 2 · Stories: US-0077 / US-0078
// Mock: screens/SCR-039_HR_Dashboard.html
// Backend: the old frontend served this at /staff — Staff and leave panel, shown to whoever holds hr.manage
// Wired: GET /api/v1/staff/dashboard (hr panel), GET /api/v1/staff/inbox, GET /api/v1/staff/attendance/today. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HrDashboard } from "@/features/dashboards/StaffDashboards";

export const metadata = { title: "SCR-039 · HR Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-039" actions={<Link href="/human-resources/staff-leave-requests" className="btn primary">
        <Icon name="arrow" className="sm" />
        Review leave
      </Link>}>
      <Suspense>
        <HrDashboard />
      </Suspense>
    </AppShell>
  );
}
