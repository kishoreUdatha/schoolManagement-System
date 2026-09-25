// TM-003 · teacher app
// Wired: GET /api/v1/teacher/my-classes, GET /api/v1/teacher/attendance, POST /api/v1/teacher/attendance/save. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherAttendance } from "@/features/teacherapp/TeacherAttendance";

export default function Page() {
  return (
    <TeacherShell screen={3}>
      <Suspense>
        <TeacherAttendance />
      </Suspense>
    </TeacherShell>
  );
}
