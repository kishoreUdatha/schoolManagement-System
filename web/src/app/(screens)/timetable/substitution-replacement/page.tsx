// SCR-127 · Substitution / Replacement
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: Phase 3 · Stories: US-0253 / US-0254
// Mock: screens/SCR-127_Substitution_Replacement.html
// Wired: GET /api/v1/school/cover/day, /cover/candidates, /cover/stats, /cover/mine, /directory/staff; POST /cover/assign, /cover/auto-assign; DELETE /cover/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CoverBoard } from "@/features/timetable/CoverBoard";
import { ASSIGN_EVENT } from "@/features/timetable/events";
import { HeadButton } from "@/features/timetable/shared";

export const metadata = { title: "SCR-127 · Substitution / Replacement · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-127" actions={<HeadButton event={ASSIGN_EVENT}>Assign substitute</HeadButton>}>
      <Suspense>
        <CoverBoard />
      </Suspense>
    </AppShell>
  );
}
