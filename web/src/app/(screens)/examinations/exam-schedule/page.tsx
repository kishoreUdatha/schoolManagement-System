// SCR-141 · Exam Schedule
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0281 / US-0282
// Mock: screens/SCR-141_Exam_Schedule.html
// Backend: the old frontend served this at /school/exams/[id]/datesheet — Papers by day, with per-class clash detection
// Wired: GET /api/v1/school/exams, /school/exam-ops/{id}/datesheet (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExamSchedule } from "@/features/examinations/ExamSchedule";

export const metadata = { title: "SCR-141 · Exam Schedule · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-141">
      <Suspense>
        <ExamSchedule />
      </Suspense>
    </AppShell>
  );
}
