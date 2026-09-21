// SCR-068 · Siblings & Family
// Module: Students · Role: School Admin · Release: Phase 3 · Stories: US-0135 / US-0136
// Mock: screens/SCR-068_Siblings_Family.html
// Wired: GET /api/v1/school/student-detail/{id}/family, /students/{id}/guardians, /students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LinkSiblingButton, StudentFamily } from "@/features/students/StudentFamily";

export const metadata = { title: "SCR-068 · Siblings & Family · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-068"
      actions={
        <Suspense>
          <LinkSiblingButton />
        </Suspense>
      }
    >
      <Suspense>
        <StudentFamily />
      </Suspense>
    </AppShell>
  );
}
