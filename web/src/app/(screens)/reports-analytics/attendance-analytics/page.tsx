// SCR-268 · Attendance Analytics
// Module: Reports & Analytics · Role: School Admin · Release: Phase 2 · Stories: US-0535 / US-0536
// Mock: screens/SCR-268_Attendance_Analytics.html
// Wired: GET /api/v1/school/reports/attendance/class-summary, /classes, /academic-years. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { AttendanceAnalytics } from "@/features/reports/attendance";

export const metadata = { title: "SCR-268 · Attendance Analytics · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-268" actions={<ExportButtons />}>
      <Suspense>
        <AttendanceAnalytics />
      </Suspense>
    </AppShell>
  );
}
