// SM-017 · student app
// Wired: GET/POST /api/v1/student/counselling-requests. Hand-maintained.

import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentCounsellor } from "@/features/parent/support/Counsellor";

export default function Page() {
  return (
    <StudentShell screen={17}>
      <StudentCounsellor />
    </StudentShell>
  );
}
