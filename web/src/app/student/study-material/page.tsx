// SM-016 · student app
// Wired: GET /student/resources, …/{id}/file. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentResources } from "@/features/studentapp/StudentMore";

export default function Page() {
  return (
    <StudentShell screen={16}>
      <StudentResources />
    </StudentShell>
  );
}
