// SCR-119 · Attendance Reports
// Module: Student Attendance · Role: School Admin · Release: Phase 3 · Stories: US-0237 / US-0238
// Mock: screens/SCR-119_Attendance_Reports.html
// Wired: GET /api/v1/school/reports/attendance/class-summary (+ .csv) (?from&to&class_id), /school/reports/attendance/daily-absent, /school/academic-years, /school/classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AttendanceSummary } from "@/features/attendance/AttendanceSummary";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-119 · Attendance Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-119"
      actions={
        <PageAction event={EV.exportReport} icon="download" primary>
          Export report
        </PageAction>
      }
    >
      <Suspense>
        <AttendanceSummary mode="report" />
      </Suspense>
    </AppShell>
  );
}
