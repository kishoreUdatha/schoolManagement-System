// SCR-101 · Learning Outcomes
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0201 / US-0202
// Mock: screens/SCR-101_Learning_Outcomes.html
// Wired: GET /api/v1/school/learning-outcomes, /learning-outcomes/coverage, /syllabus, /syllabus/{cs_id}; POST/PATCH/DELETE /learning-outcomes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LearningOutcomes } from "@/features/academics/LearningOutcomes";
import { PageAction } from "@/features/academics/planKit";

export const metadata = { title: "SCR-101 · Learning Outcomes · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-101"
      actions={
        <>
          <PageAction action="outcomes:export" icon="download">
            Export
          </PageAction>
          <PageAction action="outcomes:add" icon="plus" primary>
            Add outcome
          </PageAction>
        </>
      }
    >
      <Suspense>
        <LearningOutcomes />
      </Suspense>
    </AppShell>
  );
}
