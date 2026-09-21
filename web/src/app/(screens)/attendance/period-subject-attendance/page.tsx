// SCR-111 · Period / Subject Attendance
// Module: Student Attendance · Role: Teacher · Release: MVP · Stories: US-0221 / US-0222
// Mock: screens/SCR-111_Period_Subject_Attendance.html
// Wired: GET + POST /api/v1/school/attendance-ops/periods; lessons from GET /teacher/timetable (teacher) or /school/classes + /school/periods (office). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PeriodAttendance } from "@/features/attendance/PeriodAttendance";
import { LESSON_FORM } from "@/features/attendance/types";

export const metadata = { title: "SCR-111 · Period / Subject Attendance · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-111"
      actions={
        <button type="submit" form={LESSON_FORM} className="btn primary">
          <Icon name="check" className="sm" />
          Save attendance
        </button>
      }
    >
      <Suspense>
        <PeriodAttendance />
      </Suspense>
    </AppShell>
  );
}
