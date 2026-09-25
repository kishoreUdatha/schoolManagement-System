// TM-011 · teacher app
// Wired: GET /api/v1/teacher/homework/{id}, GET /api/v1/teacher/homework/{id}/submissions, PATCH /api/v1/teacher/homework/submissions/{id}/review. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherSubmissions } from "@/features/teacherapp/TeacherSubmissions";

export default function Page() {
  return (
    <TeacherShell screen={11}>
      <Suspense>
        <TeacherSubmissions />
      </Suspense>
    </TeacherShell>
  );
}
