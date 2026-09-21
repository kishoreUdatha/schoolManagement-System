// SCR-042 · Librarian Dashboard
// Module: Role Dashboards · Role: Librarian · Release: Phase 3 · Stories: US-0083 / US-0084
// Mock: screens/SCR-042_Librarian_Dashboard.html
// Backend: the old frontend served this at /staff — Library panel, shown to whoever holds library.manage
// Wired: GET /api/v1/staff/dashboard (library panel), GET /api/v1/staff/inbox, GET /api/v1/staff/attendance/today. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LibrarianDashboard } from "@/features/dashboards/StaffDashboards";

export const metadata = { title: "SCR-042 · Librarian Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-042" actions={<Link href="/library/issue-book" className="btn primary">
        <Icon name="arrow" className="sm" />
        Issue book
      </Link>}>
      <Suspense>
        <LibrarianDashboard />
      </Suspense>
    </AppShell>
  );
}
