// SCR-088 · Staff Attendance Summary
// Module: Teachers & Staff · Role: School Admin · Release: Phase 3 · Stories: US-0175 / US-0176
// Mock: screens/SCR-088_Staff_Attendance_Summary.html
// Wired: GET /api/v1/school/staff-ops/attendance-summary (year, month). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StaffAttendanceSummary } from "@/features/staff/StaffAttendanceSummary";

export const metadata = { title: "SCR-088 · Staff Attendance Summary · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-088">
      <Suspense>
        <StaffAttendanceSummary />
      </Suspense>
    </AppShell>
  );
}
