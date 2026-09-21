// SCR-143 · Invigilation Assignment
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0285 / US-0286
// Mock: screens/SCR-143_Invigilation_Assignment.html
// Backend: the old frontend served this at /school/exams/[id]/invigilation — Per-room duty with double-booking refused, plus roster
// Wired: GET /api/v1/school/exam-ops/{id}/duty-roster, GET/POST /school/exam-ops/papers/{id}/invigilators, GET …/invigilators/available, DELETE …/invigilators/{invigilation_id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Invigilation } from "@/features/examinations/Invigilation";

export const metadata = { title: "SCR-143 · Invigilation Assignment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-143">
      <Suspense>
        <Invigilation />
      </Suspense>
    </AppShell>
  );
}
