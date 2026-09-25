// SM-007 · student app
// Wired: GET /api/v1/student/exams/{id}, …/report-card.pdf. Hand-maintained.

import { Suspense } from "react";
import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentResult } from "@/features/studentapp/StudentScreens";

export default function Page() {
  return (
    <StudentShell screen={7}>
      <Suspense>
        <StudentResult />
      </Suspense>
    </StudentShell>
  );
}
