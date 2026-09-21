// SCR-148 · Marks Verification
// Module: Examinations / Marks / Results · Role: Teacher · Release: Phase 2 · Stories: US-0295 / US-0296
// Mock: screens/SCR-148_Marks_Verification.html
// Backend: the old frontend served this at /school/exams — Sign off a paper; refuses whoever entered the marks
// Wired: GET /api/v1/school/exams/{id}, /school/exam-ops/{id}/dashboard, /school/exports/marks.csv; POST /school/exams/papers/{id}/verify, /school/exams/{id}/marks-window. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { MarksVerification } from "@/features/examinations/MarksVerification";

export const metadata = { title: "SCR-148 · Marks Verification · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-148">
      <Suspense>
        <MarksVerification />
      </Suspense>
    </AppShell>
  );
}
