// NEW-011 · Student Logins
// Module: Students · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/student-logins, POST /school/student-logins/{student_id}, POST /school/student-logins/class/{class_id}, DELETE /school/student-logins/{student_id}, GET /school/profile, /school/classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/attendance/shared";
import { StudentLogins } from "@/features/students/StudentLogins";
import { EV } from "@/features/students/types";

export const metadata = { title: "NEW-011 · Student Logins · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-011"
      actions={
        <PageAction event={EV.classLogins} icon="users" primary>
          Logins for a class
        </PageAction>
      }
    >
      <Suspense>
        <StudentLogins />
      </Suspense>
    </AppShell>
  );
}
