// NEW-024 · Online Test Results
// Module: Examinations / Marks / Results · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/online-tests/[id]/results
// Wired: GET /api/v1/school/online-tests, /school/online-tests/{id}/results (?id=), /school/test-attempts/{id} (?attempt=), PUT /school/test-attempts/{id}/answers/{question_id}/grade. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TestResults } from "@/features/onlinetests/TestResults";

export const metadata = { title: "NEW-024 · Online Test Results · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-024">
      <Suspense>
        <TestResults />
      </Suspense>
    </AppShell>
  );
}
