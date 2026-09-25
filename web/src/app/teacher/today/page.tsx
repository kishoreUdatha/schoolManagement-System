// TM-002 · teacher app
// Wired: GET /api/v1/teacher/dashboard, /api/v1/teacher/timetable, /api/v1/teacher/attendance (today, per class-teacher section). Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherToday } from "@/features/teacherapp/TeacherToday";

export default function Page() {
  return (
    <TeacherShell screen={2}>
      <TeacherToday />
    </TeacherShell>
  );
}
