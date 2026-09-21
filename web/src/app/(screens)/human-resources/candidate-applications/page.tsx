// SCR-174 · Candidate Applications
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0347 / US-0348
// Mock: screens/SCR-174_Candidate_Applications.html
// Backend: the old frontend served this at /school/recruitment — Opening and stage filters with moves
// Wired: GET/POST /api/v1/school/hr/applications, POST /hr/applications/{id}/stage; GET /hr/openings. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CandidateBoard } from "@/features/hr/CandidateBoard";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-174 · Candidate Applications · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-174" actions={<PageAction>Add candidate</PageAction>}>
      <Suspense>
        <CandidateBoard />
      </Suspense>
    </AppShell>
  );
}
