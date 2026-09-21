// SCR-172 · Recruitment Requisitions
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0343 / US-0344
// Mock: screens/SCR-172_Recruitment_Requisitions.html
// Backend: the old frontend served this at /school/recruitment/requisitions — Cannot be approved by whoever raised it
// Wired: GET/POST /api/v1/school/hr-ops/requisitions, POST …/{id}/submit, …/{id}/decide, …/{id}/status; GET /departments. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Requisitions } from "@/features/hr/Requisitions";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-172 · Recruitment Requisitions · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-172" actions={<PageAction>Create requisition</PageAction>}>
      <Suspense>
        <Requisitions />
      </Suspense>
    </AppShell>
  );
}
