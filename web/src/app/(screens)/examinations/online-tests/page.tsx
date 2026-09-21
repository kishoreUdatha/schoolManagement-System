// NEW-023 · Online Tests
// Module: Examinations / Marks / Results · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/online-tests and /school/online-tests/[id]
// Wired: GET/POST /api/v1/school/online-tests; with ?id=: GET/PUT/DELETE /school/online-tests/{id}, POST …/questions, DELETE …/questions/{qid}, PUT …/question-order, POST …/auto-pick, …/publish, …/close; GET /school/questions, /school/syllabus. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/onlinetests/kit";
import { OnlineTests } from "@/features/onlinetests/OnlineTests";

export const metadata = { title: "NEW-023 · Online Tests · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-023"
      actions={
        <PageAction name="add" icon="plus" primary>
          New test
        </PageAction>
      }
    >
      <Suspense>
        <OnlineTests />
      </Suspense>
    </AppShell>
  );
}
