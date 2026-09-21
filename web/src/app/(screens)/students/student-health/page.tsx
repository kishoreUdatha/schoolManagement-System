// SCR-065 · Student Health
// Module: Students · Role: School Admin · Release: Phase 2 · Stories: US-0129 / US-0130
// Mock: screens/SCR-065_Student_Health.html
// Wired: GET /api/v1/school/health/students/{id}, PUT /health/students/{id}/profile, /students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StudentHealth, UpdateHealthButton } from "@/features/students/StudentHealth";

export const metadata = { title: "SCR-065 · Student Health · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-065" actions={<UpdateHealthButton />}>
      <Suspense>
        <StudentHealth />
      </Suspense>
    </AppShell>
  );
}
