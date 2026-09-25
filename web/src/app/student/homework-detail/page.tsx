// SM-005 · student app
// Wired: GET /api/v1/student/homework, …/{id}/submission; POST/PATCH …/submission, POST …/submission/files, GET …/files/{id}. Hand-maintained.

import { Suspense } from "react";
import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentHomeworkDetail } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={5}>
      <Suspense>
        <StudentHomeworkDetail />
      </Suspense>
    </StudentShell>
  );
}
