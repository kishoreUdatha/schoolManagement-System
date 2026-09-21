// SCR-057 · Student Profile Overview
// Module: Students · Role: School Admin · Release: MVP
// Mock: screens/SCR-057_Student_Profile_Overview.html
// Wired: GET /api/v1/school/students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StudentProfile, WithStudentLink } from "@/features/students/StudentProfile";

export const metadata = { title: "SCR-057 · Student Profile Overview · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-057"
      actions={
        <Suspense>
          <WithStudentLink screen={58} icon="arrow">
            Edit student
          </WithStudentLink>
        </Suspense>
      }
    >
      <Suspense>
        <StudentProfile />
      </Suspense>
    </AppShell>
  );
}
