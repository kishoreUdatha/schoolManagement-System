// SM-012 · student app
// Wired: GET/PUT/POST /student/test-attempts/{id}…. Hand-maintained.

import { Suspense } from "react";
import { StudentShell } from "@/components/studentapp/StudentShell";
import { StudentTest } from "@/features/studentapp/StudentMore";

export default function Page() {
  return (
    <StudentShell screen={12}>
      <Suspense>
        <StudentTest />
      </Suspense>
    </StudentShell>
  );
}
