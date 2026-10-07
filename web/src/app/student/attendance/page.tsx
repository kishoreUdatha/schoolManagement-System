// SM-014 · student app
// Wired: GET /student/attendance/month. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentAttendance } from "@/features/studentapp/StudentMore";

export default function Page() {
  return (
    <StudentShell screen={14}>
      <StudentAttendance />
    </StudentShell>
  );
}
