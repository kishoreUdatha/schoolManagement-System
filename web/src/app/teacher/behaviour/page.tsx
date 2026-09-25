// TM-015 · teacher app
// Wired: POST /api/v1/teacher/behaviour, POST /api/v1/teacher/behaviour/ai-suggest. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherBehaviourNote } from "@/features/teacherapp/TeacherStudent";

export default function Page() {
  return (
    <TeacherShell screen={15}>
      <Suspense>
        <TeacherBehaviourNote />
      </Suspense>
    </TeacherShell>
  );
}
