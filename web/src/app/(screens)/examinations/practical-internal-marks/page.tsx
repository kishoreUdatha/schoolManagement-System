// SCR-146 · Practical / Internal Marks
// Module: Examinations / Marks / Results · Role: Teacher · Release: Phase 2 · Stories: US-0291 / US-0292
// Mock: screens/SCR-146_Practical_Internal_Marks.html
// Backend: the old frontend served this at /school/exams/papers/[paperId]/components — Parts must add up; the total is their sum
// Wired: GET/PUT /api/v1/school/exam-ops/papers/{id}/components, GET/PUT …/component-marks (?id=&paper=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PracticalMarks } from "@/features/examinations/PracticalMarks";

export const metadata = { title: "SCR-146 · Practical / Internal Marks · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-146">
      <Suspense>
        <PracticalMarks />
      </Suspense>
    </AppShell>
  );
}
