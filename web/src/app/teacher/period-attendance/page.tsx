// TM-016 · teacher app
// Wired: GET /api/v1/teacher/timetable, GET/POST /api/v1/school/attendance-ops/periods. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherPeriodAttendance } from "@/features/teacherapp/TeacherPeriods";

export default function Page() {
  return (
    <TeacherShell screen={16}>
      <Suspense>
        <TeacherPeriodAttendance />
      </Suspense>
    </TeacherShell>
  );
}
