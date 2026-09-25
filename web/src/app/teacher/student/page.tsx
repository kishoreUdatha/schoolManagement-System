// TM-014 · teacher app
// Wired: GET /api/v1/teacher/students/{id}/360. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherStudent } from "@/features/teacherapp/TeacherStudent";

export default function Page() {
  return (
    <TeacherShell screen={14}>
      <Suspense>
        <TeacherStudent />
      </Suspense>
    </TeacherShell>
  );
}
