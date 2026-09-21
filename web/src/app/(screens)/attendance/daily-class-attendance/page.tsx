// SCR-110 · Daily Class Attendance
// Module: Student Attendance · Role: Teacher · Release: MVP · Stories: US-0219 / US-0220
// Mock: screens/SCR-110_Daily_Class_Attendance.html
// Wired: GET /api/v1/teacher/my-classes, GET /teacher/attendance (?section_id&date, school's day), POST /teacher/attendance/save. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DailyAttendance } from "@/features/attendance/DailyAttendance";
import { DAILY_FORM } from "@/features/attendance/types";

export const metadata = { title: "SCR-110 · Daily Class Attendance · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-110"
      actions={
        <button type="submit" form={DAILY_FORM} className="btn primary">
          <Icon name="check" className="sm" />
          Save attendance
        </button>
      }
    >
      <Suspense>
        <DailyAttendance />
      </Suspense>
    </AppShell>
  );
}
