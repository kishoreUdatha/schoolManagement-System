// SCR-036 · Student Dashboard
// Module: Role Dashboards · Role: Student · Release: MVP · Stories: US-0071 / US-0072
// Mock: screens/SCR-036_Student_Dashboard.html
// Backend: the old frontend served this at /student — Homework due, today's lessons, attendance, notices
// Wired: GET /api/v1/student/dashboard, GET /api/v1/student/exams/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentDashboard } from "@/features/dashboards/StudentDashboard";

export const metadata = { title: "SCR-036 · Student Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-036" actions={<Link href="/homework/student-homework-view" className="btn primary">
        <Icon name="arrow" className="sm" />
        View assignments
      </Link>}>
      <Suspense>
        <StudentDashboard />
      </Suspense>
    </AppShell>
  );
}
