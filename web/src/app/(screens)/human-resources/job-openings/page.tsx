// SCR-173 · Job Openings
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0345 / US-0346
// Mock: screens/SCR-173_Job_Openings.html
// Backend: the old frontend served this at /school/recruitment — Create, publish, close, careers flag
// Wired: GET/POST /api/v1/school/hr/openings, PUT/DELETE /hr/openings/{id}, POST /hr/openings/{id}/status; GET /departments. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { JobOpenings } from "@/features/hr/JobOpenings";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-173 · Job Openings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-173" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <PageAction>Create opening</PageAction>
      </>}>
      <Suspense>
        <JobOpenings />
      </Suspense>
    </AppShell>
  );
}
