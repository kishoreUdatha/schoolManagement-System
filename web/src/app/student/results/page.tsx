// SM-006 · student app
// Wired: GET /api/v1/student/exams. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentResults } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={6}>
      <StudentResults />
    </StudentShell>
  );
}
