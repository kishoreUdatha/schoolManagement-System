// SM-003 · student app
// Wired: GET /api/v1/student/timetable. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentTimetable } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={3}>
      <StudentTimetable />
    </StudentShell>
  );
}
