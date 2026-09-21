// SCR-037 · Parent Dashboard
// Module: Role Dashboards · Role: Parent · Release: MVP · Stories: US-0073 / US-0074
// Mock: screens/SCR-037_Parent_Dashboard.html
// Backend: the old frontend served this at /parent — Children cards, notices, holidays
// Wired: GET /api/v1/parent/me/children, /parent/me/children/{id}/timetable, /parent/me/notices, /parent/me/notices/unread-count, /parent/me/calendar. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ParentDashboard } from "@/features/dashboards/ParentDashboard";

export const metadata = { title: "SCR-037 · Parent Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-037" actions={<Link href="/students/student-profile-overview" className="btn primary">
        <Icon name="arrow" className="sm" />
        View children
      </Link>}>
      <Suspense>
        <ParentDashboard />
      </Suspense>
    </AppShell>
  );
}
