// SCR-117 · Monthly Attendance Summary
// Module: Student Attendance · Role: School Admin · Release: Phase 2 · Stories: US-0233 / US-0234
// Mock: screens/SCR-117_Monthly_Attendance_Summary.html
// Wired: GET /api/v1/school/reports/attendance/class-summary (+ .csv) for one month, /school/academic-years, /school/classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AttendanceSummary } from "@/features/attendance/AttendanceSummary";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-117 · Monthly Attendance Summary · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-117"
      actions={
        <PageAction event={EV.exportMonthly} icon="download" primary>
          Export summary
        </PageAction>
      }
    >
      <Suspense>
        <AttendanceSummary mode="monthly" />
      </Suspense>
    </AppShell>
  );
}
