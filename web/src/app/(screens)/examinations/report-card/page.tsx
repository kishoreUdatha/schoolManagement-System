// SCR-152 · Report Card
// Module: Examinations / Marks / Results · Role: Student · Release: Phase 3 · Stories: US-0303 / US-0304
// Mock: screens/SCR-152_Report_Card.html
// Backend: the old frontend served this at /student/exams/[examId] — Same renderer as the school and the parents
// Wired: GET /api/v1/student/exams[/{id}], /parent/me/children/{sid}/exams[/{id}], /school/result-decisions/exams/{id}/students/{sid}; report-card.pdf for student and parent. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ResultCard } from "@/features/examinations/ResultCard";

export const metadata = { title: "SCR-152 · Report Card · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-152">
      <Suspense>
        <ResultCard kind="report" />
      </Suspense>
    </AppShell>
  );
}
