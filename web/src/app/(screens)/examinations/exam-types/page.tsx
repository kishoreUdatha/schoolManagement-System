// SCR-139 · Exam Types
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0277 / US-0278
// Mock: screens/SCR-139_Exam_Types.html
// Backend: the old frontend served this at /school/grading — Exam types are one card among three (in a tab, complete)
// Wired: GET/POST /api/v1/school/exam-types, PUT/DELETE /school/exam-types/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExamTypes } from "@/features/examinations/ExamTypes";

export const metadata = { title: "SCR-139 · Exam Types · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-139">
      <Suspense>
        <ExamTypes />
      </Suspense>
    </AppShell>
  );
}
