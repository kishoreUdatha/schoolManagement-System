// SCR-104 · Lesson Plan Review & Approval
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0207 / US-0208
// Mock: screens/SCR-104_Lesson_Plan_Review_Approval.html
// Wired: GET /api/v1/school/lesson-plans, POST /lesson-plans/{id}/review. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LessonPlanReview } from "@/features/academics/LessonPlanReview";
import { PageAction } from "@/features/academics/planKit";

export const metadata = { title: "SCR-104 · Lesson Plan Review & Approval · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-104"
      actions={
        <PageAction action="lesson-review:approve" icon="check" primary>
          Approve lesson plan
        </PageAction>
      }
    >
      <Suspense>
        <LessonPlanReview />
      </Suspense>
    </AppShell>
  );
}
