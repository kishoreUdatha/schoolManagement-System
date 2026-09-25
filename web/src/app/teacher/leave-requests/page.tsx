// TM-017 · teacher app
// Wired: GET /api/v1/school/student-leaves (?status=pending), POST /school/student-leaves/{id}/decide. Hand-maintained.

import { TeacherShell } from "@/components/teacherapp/TeacherShell";
import { TeacherLeaveRequests } from "@/features/teacherapp/TeacherLeave";

export default function Page() {
  return (
    <TeacherShell screen={17}>
      <TeacherLeaveRequests />
    </TeacherShell>
  );
}
