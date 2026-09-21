// SCR-035 · Teacher Dashboard
// Module: Role Dashboards · Role: Teacher · Release: MVP · Stories: US-0069 / US-0070
// Mock: screens/SCR-035_Teacher_Dashboard.html
// Backend: the old frontend served this at /teacher — Today classes and stat cards
// Wired: GET /api/v1/teacher/dashboard, /teacher/attendance, /teacher/notices, /teacher/homework. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TeacherDashboard } from "@/features/dashboards/TeacherDashboard";

export const metadata = { title: "SCR-035 · Teacher Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-035" actions={<Link href="/attendance/daily-class-attendance" className="btn primary">
        <Icon name="arrow" className="sm" />
        Mark attendance
      </Link>}>
      <Suspense>
        <TeacherDashboard />
      </Suspense>
    </AppShell>
  );
}
