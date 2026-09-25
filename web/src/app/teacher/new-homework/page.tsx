// TM-005 · teacher app
// Wired: GET /api/v1/teacher/my-classes, POST /api/v1/teacher/homework. Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherNewHomework } from "@/features/teacherapp/TeacherHomework";

export default function Page() {
  return (
    <TeacherShell screen={5}>
      <TeacherNewHomework />
    </TeacherShell>
  );
}
