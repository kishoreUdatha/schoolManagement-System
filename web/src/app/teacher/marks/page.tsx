// TM-006 · teacher app
// Wired: GET /api/v1/teacher/marks/papers, GET /api/v1/teacher/my-classes. Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherMarksList } from "@/features/teacherapp/TeacherMarks";

export default function Page() {
  return (
    <TeacherShell screen={6}>
      <TeacherMarksList />
    </TeacherShell>
  );
}
