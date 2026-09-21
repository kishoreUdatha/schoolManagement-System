// SCR-041 · Transport Manager Dashboard
// Module: Role Dashboards · Role: Transport Manager · Release: Phase 3 · Stories: US-0081 / US-0082
// Mock: screens/SCR-041_Transport_Manager_Dashboard.html
// Backend: the old frontend served this at /staff — Transport panel, shown to whoever holds transport.manage
// Wired: GET /api/v1/staff/dashboard (transport panel), GET /api/v1/staff/inbox, GET /api/v1/staff/attendance/today. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TransportManagerDashboard } from "@/features/dashboards/StaffDashboards";

export const metadata = { title: "SCR-041 · Transport Manager Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-041" actions={<Link href="/transport/live-gps-tracking" className="btn primary">
        <Icon name="arrow" className="sm" />
        Track buses
      </Link>}>
      <Suspense>
        <TransportManagerDashboard />
      </Suspense>
    </AppShell>
  );
}
