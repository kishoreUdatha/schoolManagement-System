// SCR-149 · Grade / Grading Setup
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: Phase 2 · Stories: US-0297 / US-0298
// Mock: screens/SCR-149_Grade_Grading_Setup.html
// Backend: the old frontend served this at /school/grading — Scale CRUD, bands, seed, default
// Wired: GET/POST /api/v1/school/grade-scales, PUT/DELETE /grade-scales/{id}, POST /grade-scales/{id}/default, /grade-scales/seed-cbse. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { GradingSetup } from "@/features/examinations/GradingSetup";

export const metadata = { title: "SCR-149 · Grade / Grading Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-149">
      <Suspense>
        <GradingSetup />
      </Suspense>
    </AppShell>
  );
}
