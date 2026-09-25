// TM-001 · teacher app
// Wired: POST /api/v1/teacher/auth/login (+ /verify-otp when asked); session.set, then ?next= or /teacher/today. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherSignIn } from "@/features/teacherapp/TeacherSignIn";

export default function Page() {
  return (
    <TeacherShell screen={1}>
      <Suspense>
        <TeacherSignIn />
      </Suspense>
    </TeacherShell>
  );
}
