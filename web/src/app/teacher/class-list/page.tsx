// TM-010 · teacher app
// Wired: GET /api/v1/teacher/sections/{id}/students. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherClassList } from "@/features/teacherapp/TeacherClasses";

export default function Page() {
  return (
    <TeacherShell screen={10}>
      <Suspense>
        <TeacherClassList />
      </Suspense>
    </TeacherShell>
  );
}
