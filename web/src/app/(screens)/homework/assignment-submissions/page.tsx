// SCR-136 · Assignment Submissions
// Module: Homework & Assignments · Role: Student · Release: Phase 2 · Stories: US-0271 / US-0272
// Mock: screens/SCR-136_Assignment_Submissions.html
// Wired: teacher: GET /api/v1/teacher/projects/{id}/progress (?id=); student/parent: homework + submission portals. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Submissions, StartEvaluation } from "@/features/homework/Submissions";

export const metadata = { title: "SCR-136 · Assignment Submissions · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-136" actions={<Suspense><StartEvaluation /></Suspense>}>
      <Suspense>
        <Submissions />
      </Suspense>
    </AppShell>
  );
}
