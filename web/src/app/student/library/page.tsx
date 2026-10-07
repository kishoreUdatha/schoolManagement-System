// SM-015 · student app
// Wired: GET /student/library. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentLibrary } from "@/features/studentapp/StudentMore";

export default function Page() {
  return (
    <StudentShell screen={15}>
      <StudentLibrary />
    </StudentShell>
  );
}
