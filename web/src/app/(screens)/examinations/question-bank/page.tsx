// NEW-022 · Question Bank
// Module: Examinations / Marks / Results · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/online-tests (question bank tab)
// Wired: GET/POST /api/v1/school/questions, GET/PUT/DELETE /school/questions/{id}, POST /school/questions/{id}/active, GET /school/syllabus. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/onlinetests/kit";
import { QuestionBank } from "@/features/onlinetests/QuestionBank";

export const metadata = { title: "NEW-022 · Question Bank · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-022"
      actions={
        <PageAction name="add" icon="plus" primary>
          Add question
        </PageAction>
      }
    >
      <Suspense>
        <QuestionBank />
      </Suspense>
    </AppShell>
  );
}
