// SCR-175 · Candidate Details
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0349 / US-0350
// Mock: screens/SCR-175_Candidate_Details.html
// Backend: the old frontend served this at /school/recruitment — Candidate detail in a modal only (in a tab, complete)
// Wired: GET /api/v1/school/hr/applications/{id} (?id=), POST …/stage, …/interviews, PUT/DELETE /hr/interviews/{id}, GET /hr/candidates/{id}/resume, /directory/staff. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CandidateDetails } from "@/features/hr/CandidateDetails";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-175 · Candidate Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-175" actions={<PageAction icon="arrow">Schedule interview</PageAction>}>
      <Suspense>
        <CandidateDetails />
      </Suspense>
    </AppShell>
  );
}
