// SCR-153 · Promotion Decision
// Module: Examinations / Marks / Results · Role: Principal · Release: Phase 3 · Stories: US-0305 / US-0306
// Mock: screens/SCR-153_Promotion_Decision.html
// Backend: the old frontend served this at /school/exams/[id]/promotion — Result-driven suggestion, review kept apart from fail
// Wired: GET /api/v1/school/exam-ops/{id}/promotion-preview, /school/exams. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PromotionDecision } from "@/features/examinations/PromotionDecision";

export const metadata = { title: "SCR-153 · Promotion Decision · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-153">
      <Suspense>
        <PromotionDecision />
      </Suspense>
    </AppShell>
  );
}
