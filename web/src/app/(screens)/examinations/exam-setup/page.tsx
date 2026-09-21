// SCR-140 · Exam Setup
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0279 / US-0280
// Mock: screens/SCR-140_Exam_Setup.html
// Backend: the old frontend served this at /school/exams — Create exam and add papers with marks
// Wired: POST /api/v1/school/exams, GET/PATCH /school/exams/{id} (?id=), POST /school/exams/{id}/papers, DELETE /school/exams/papers/{id}, GET /school/exam-types, /academic-years, /academic-years/{id}/terms, /classes, /classes/{id}/subjects. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExamSetup } from "@/features/examinations/ExamSetup";

export const metadata = { title: "SCR-140 · Exam Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-140">
      <Suspense>
        <ExamSetup />
      </Suspense>
    </AppShell>
  );
}
