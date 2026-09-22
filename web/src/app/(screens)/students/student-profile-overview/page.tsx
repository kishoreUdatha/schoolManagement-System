// SCR-057 · Student Profile Overview
// Module: Students · Role: School Admin · Release: MVP
// Mock: screens/SCR-057_Student_Profile_Overview.html
// Wired: GET /api/v1/school/students/{id} (?id=); ?tab= shows the Academics, Attendance,
// Results, Fees, Documents or Transport screens' content under the same header. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StudentProfile, StudentProfileActions } from "@/features/students/StudentProfile";

export const metadata = { title: "SCR-057 · Student Profile Overview · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-057"
      actions={
        <Suspense>
          <StudentProfileActions />
        </Suspense>
      }
    >
      <Suspense>
        <StudentProfile />
      </Suspense>
    </AppShell>
  );
}
