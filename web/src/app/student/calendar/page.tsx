// SM-008 · student app
// Wired: GET /api/v1/student/calendar. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentCalendar } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={8}>
      <StudentCalendar />
    </StudentShell>
  );
}
