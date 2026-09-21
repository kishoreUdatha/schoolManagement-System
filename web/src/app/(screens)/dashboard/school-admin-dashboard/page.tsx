// SCR-033 · School Admin Dashboard
// Module: Role Dashboards · Role: School Admin · Release: MVP · Stories: US-0065 / US-0066
// Mock: screens/SCR-033_School_Admin_Dashboard.html
// Backend: the old frontend served this at /school — Dashboard stat cards and panels
// Wired: GET /api/v1/school/dashboard, GET /api/v1/school/analytics/overview. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SchoolAdminDashboard } from "@/features/dashboards/OfficeDashboards";

export const metadata = { title: "SCR-033 · School Admin Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-033" actions={<Link href="/reports-analytics/executive-analytics-dashboard" className="btn primary">
        <Icon name="arrow" className="sm" />
        View school reports
      </Link>}>
      <Suspense>
        <SchoolAdminDashboard />
      </Suspense>
    </AppShell>
  );
}
