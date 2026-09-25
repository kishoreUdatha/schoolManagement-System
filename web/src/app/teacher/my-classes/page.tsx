// TM-009 · teacher app
// Wired: GET /api/v1/teacher/my-classes. Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherMyClasses } from "@/features/teacherapp/TeacherClasses";

export default function Page() {
  return (
    <TeacherShell screen={9}>
      <TeacherMyClasses />
    </TeacherShell>
  );
}
