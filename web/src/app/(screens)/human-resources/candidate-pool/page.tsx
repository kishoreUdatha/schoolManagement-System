// NEW-060 · Candidate Pool
// Module: HR / Leave / Payroll · Role: HR Manager · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/hr/candidates (?search=), POST/GET /hr/candidates/{id}/resume, GET /hr/pipeline, GET /hr/openings, POST /hr/applications. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CandidatePool } from "@/features/hr/CandidatePool";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "NEW-060 · Candidate Pool · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-060" actions={<PageAction>Add candidate</PageAction>}>
      <Suspense>
        <CandidatePool />
      </Suspense>
    </AppShell>
  );
}
