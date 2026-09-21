// NEW-021 · Rubrics
// Module: Homework & Assignments · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/rubrics and /teacher/rubrics
// Wired: GET/POST /api/v1/school/rubrics, PATCH/DELETE /school/rubrics/{id}, POST /school/rubrics/{id}/criteria, PUT/DELETE /school/rubrics/criteria/{id}, GET /school/subjects. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/onlinetests/kit";
import { Rubrics } from "@/features/rubrics/Rubrics";

export const metadata = { title: "NEW-021 · Rubrics · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-021"
      actions={
        <PageAction name="add" icon="plus" primary>
          New rubric
        </PageAction>
      }
    >
      <Suspense>
        <Rubrics />
      </Suspense>
    </AppShell>
  );
}
