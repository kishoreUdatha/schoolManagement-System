// TM-004 · teacher app
// Wired: GET /api/v1/teacher/homework. Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherHomeworkList } from "@/features/teacherapp/TeacherHomework";

export default function Page() {
  return (
    <TeacherShell screen={4}>
      <TeacherHomeworkList />
    </TeacherShell>
  );
}
