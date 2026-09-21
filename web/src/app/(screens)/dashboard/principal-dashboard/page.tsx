// SCR-034 · Principal Dashboard
// Module: Role Dashboards · Role: Principal · Release: MVP · Stories: US-0067 / US-0068
// Mock: screens/SCR-034_Principal_Dashboard.html
// Backend: the old frontend served this at /principal — Principal overview dashboard
// Wired: GET /api/v1/principal/dashboard, GET /api/v1/principal/approvals, GET /api/v1/school/analytics/overview. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PrincipalDashboard } from "@/features/dashboards/OfficeDashboards";

export const metadata = { title: "SCR-034 · Principal Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-034" actions={<Link href="/admissions/admission-approval" className="btn primary">
        <Icon name="arrow" className="sm" />
        Review approvals
      </Link>}>
      <Suspense>
        <PrincipalDashboard />
      </Suspense>
    </AppShell>
  );
}
