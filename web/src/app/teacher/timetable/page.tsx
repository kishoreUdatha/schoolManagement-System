// TM-008 · teacher app
// Wired: GET /api/v1/teacher/timetable. Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherTimetable } from "@/features/teacherapp/TeacherClasses";

export default function Page() {
  return (
    <TeacherShell screen={8}>
      <TeacherTimetable />
    </TeacherShell>
  );
}
