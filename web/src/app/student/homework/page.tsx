// SM-004 · student app
// Wired: GET /api/v1/student/homework, /dashboard (handed-in flags). Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentHomeworkList } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={4}>
      <StudentHomeworkList />
    </StudentShell>
  );
}
