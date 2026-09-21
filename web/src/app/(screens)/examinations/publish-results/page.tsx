// SCR-150 · Publish Results
// Module: Examinations / Marks / Results · Role: Principal · Release: Phase 3 · Stories: US-0299 / US-0300
// Mock: screens/SCR-150_Publish_Results.html
// Backend: the old frontend served this at /principal/exams — Principal publishes, told what is outstanding first
// Wired: GET /api/v1/school/exams, /school/exam-ops/{id}/dashboard; POST /school/exams/{id}/publish, /unpublish. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PublishResults } from "@/features/examinations/PublishResults";

export const metadata = { title: "SCR-150 · Publish Results · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-150">
      <Suspense>
        <PublishResults />
      </Suspense>
    </AppShell>
  );
}
