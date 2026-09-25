// SM-002 · student app
// Wired: GET /api/v1/student/dashboard. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentHome } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={2}>
      <StudentHome />
    </StudentShell>
  );
}
