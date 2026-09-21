// SCR-176 · Interview Schedule
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0351 / US-0352
// Mock: screens/SCR-176_Interview_Schedule.html
// Backend: the old frontend served this at /school/recruitment/interviews — Now one query for a window, not eighty
// Wired: GET /api/v1/school/ops/interviews?from=&to=, GET /hr/applications, POST /hr/applications/{id}/interviews, GET /directory/staff. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InterviewSchedule } from "@/features/hr/InterviewSchedule";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-176 · Interview Schedule · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-176" actions={<PageAction icon="check">Schedule interview</PageAction>}>
      <Suspense>
        <InterviewSchedule />
      </Suspense>
    </AppShell>
  );
}
