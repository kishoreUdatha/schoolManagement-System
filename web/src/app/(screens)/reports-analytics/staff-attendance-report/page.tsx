// SCR-276 · Staff Attendance Report
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0551 / US-0552
// Mock: screens/SCR-276_Staff_Attendance_Report.html
// Wired: GET /api/v1/school/analytics/staff-attendance. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { StaffAttendanceReport } from "@/features/reports/attendance";

export const metadata = { title: "SCR-276 · Staff Attendance Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-276" actions={<ExportButtons />}>
      <Suspense>
        <StaffAttendanceReport />
      </Suspense>
    </AppShell>
  );
}
