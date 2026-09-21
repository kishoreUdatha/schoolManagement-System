// SCR-102 · Lesson Plans
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0203 / US-0204
// Mock: screens/SCR-102_Lesson_Plans.html
// Wired: GET /api/v1/school/lesson-plans (status, start, end). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LessonPlanList } from "@/features/academics/LessonPlanList";
import { PageAction } from "@/features/academics/planKit";

export const metadata = { title: "SCR-102 · Lesson Plans · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-102"
      actions={
        <>
          <PageAction action="lesson-plans:export" icon="download">
            Export
          </PageAction>
          <Link href="/academics/create-edit-lesson-plan" className="btn primary">
            <Icon name="plus" className="sm" />
            Create lesson plan
          </Link>
        </>
      }
    >
      <Suspense>
        <LessonPlanList />
      </Suspense>
    </AppShell>
  );
}
