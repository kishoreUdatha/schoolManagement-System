// SM-009 · student app
// Wired: GET /api/v1/student/me, /dashboard. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentProfile } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={9}>
      <StudentProfile />
    </StudentShell>
  );
}
