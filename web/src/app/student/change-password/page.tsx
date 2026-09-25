// SM-010 · student app
// Wired: POST /api/v1/student/auth/change-password. Hand-maintained.

import { Suspense } from "react";
import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentChangePassword } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={10}>
      <Suspense>
        <StudentChangePassword />
      </Suspense>
    </StudentShell>
  );
}
