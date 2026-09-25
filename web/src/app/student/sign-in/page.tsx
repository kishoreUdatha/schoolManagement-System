// SM-001 · student app
// Wired: POST /api/v1/student/auth/login (school code + admission number + password); first sign-in goes to change password. Hand-maintained.

import { Suspense } from "react";
import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentSignIn } from "@/features/studentapp/StudentSignIn";

export default function Page() {
  return (
    <StudentShell screen={1}>
      <Suspense>
        <StudentSignIn />
      </Suspense>
    </StudentShell>
  );
}
