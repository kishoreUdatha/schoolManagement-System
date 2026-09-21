// SCR-264 · Executive Analytics Dashboard
// Module: Reports & Analytics · Role: School Admin · Release: MVP · Stories: US-0527 / US-0528
// Mock: screens/SCR-264_Executive_Analytics_Dashboard.html
// Wired: GET /api/v1/school/analytics/overview?months=6, GET /api/v1/school/holidays?upcoming. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ExecutiveDashboard } from "@/features/reports/Executive";

export const metadata = { title: "SCR-264 · Executive Analytics Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-264" actions={<Link href="/reports-analytics/admission-reports" className="btn primary">
        <Icon name="arrow" className="sm" />
        View reports
      </Link>}>
      <Suspense>
        <ExecutiveDashboard />
      </Suspense>
    </AppShell>
  );
}
