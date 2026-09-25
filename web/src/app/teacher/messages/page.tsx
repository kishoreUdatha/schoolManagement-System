// TM-012 · teacher app
// Wired: GET /api/v1/teacher/conversations. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherMessages } from "@/features/teacherapp/TeacherMessages";

export default function Page() {
  return (
    <TeacherShell screen={12}>
      <Suspense>
        <TeacherMessages />
      </Suspense>
    </TeacherShell>
  );
}
