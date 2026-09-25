// TM-013 · teacher app
// Wired: GET/POST /api/v1/teacher/conversations/{id}/messages, POST …/mark-read, PATCH /api/v1/teacher/conversations/{id}. Hand-maintained.

import { Suspense } from "react";
import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherConversation } from "@/features/teacherapp/TeacherMessages";

export default function Page() {
  return (
    <TeacherShell screen={13}>
      <Suspense>
        <TeacherConversation />
      </Suspense>
    </TeacherShell>
  );
}
