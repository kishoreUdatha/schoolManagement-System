// SM-013 · student app
// Wired: GET /student/notices. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentNotices } from "@/features/studentapp/StudentMore";

export default function Page() {
  return (
    <StudentShell screen={13}>
      <StudentNotices />
    </StudentShell>
  );
}
