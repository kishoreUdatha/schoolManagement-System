// SM-011 · student app
// Wired: GET /student/tests, POST /student/tests/{id}/start. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentTests } from "@/features/studentapp/StudentMore";

export default function Page() {
  return (
    <StudentShell screen={11}>
      <StudentTests />
    </StudentShell>
  );
}
