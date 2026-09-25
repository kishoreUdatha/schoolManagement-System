// TM-007 · teacher app
// Wired: GET /api/v1/teacher/marks/papers/{id}?section_id=, POST …/save. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherMarksEntry } from "@/features/teacherapp/TeacherMarks";

export default function Page() {
  return (
    <TeacherShell screen={7}>
      <Suspense>
        <TeacherMarksEntry />
      </Suspense>
    </TeacherShell>
  );
}
