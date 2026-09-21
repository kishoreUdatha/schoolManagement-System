// SCR-151 · Student Result
// Module: Examinations / Marks / Results · Role: Student · Release: Phase 3 · Stories: US-0301 / US-0302
// Mock: screens/SCR-151_Student_Result.html
// Backend: the old frontend served this at /student/exams/[examId] — Published only, withheld stays withheld
// Wired: GET /api/v1/student/exams[/{id}], /parent/me/children/{sid}/exams[/{id}], /school/result-decisions/exams/{id}/students/{sid}; report-card.pdf for student and parent. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ResultCard } from "@/features/examinations/ResultCard";

export const metadata = { title: "SCR-151 · Student Result · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-151">
      <Suspense>
        <ResultCard kind="result" />
      </Suspense>
    </AppShell>
  );
}
