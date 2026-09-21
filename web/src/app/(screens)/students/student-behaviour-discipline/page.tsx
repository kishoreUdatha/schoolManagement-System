// SCR-064 · Student Behaviour & Discipline
// Module: Students · Role: School Admin · Release: Phase 2 · Stories: US-0127 / US-0128
// Mock: screens/SCR-064_Student_Behaviour_Discipline.html
// Wired: GET/POST /api/v1/school/discipline/incidents (?student_id=), POST /discipline/incidents/{id}/actions, /students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AddObservationButton, StudentBehaviour } from "@/features/students/StudentBehaviour";

export const metadata = { title: "SCR-064 · Student Behaviour & Discipline · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-064" actions={<AddObservationButton />}>
      <Suspense>
        <StudentBehaviour />
      </Suspense>
    </AppShell>
  );
}
