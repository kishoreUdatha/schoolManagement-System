// NEW-050 · Result Overrides
// Module: Examinations / Marks / Results · Role: Principal · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/result-decisions
// Wired: GET/POST /api/v1/school/result-decisions, GET/PATCH/DELETE /school/result-decisions/{id} (?id=), GET /school/result-decisions/exams/{exam_id}/students/{student_id}, /school/exams, /school/students. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/onlinetests/kit";
import { ResultOverrides } from "@/features/examinations/ResultOverrides";

export const metadata = { title: "NEW-050 · Result Overrides · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-050"
      actions={
        <PageAction name="add" icon="plus" primary>
          New decision
        </PageAction>
      }
    >
      <Suspense>
        <ResultOverrides />
      </Suspense>
    </AppShell>
  );
}
