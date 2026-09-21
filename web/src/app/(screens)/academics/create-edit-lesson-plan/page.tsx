// SCR-103 · Create / Edit Lesson Plan
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0205 / US-0206
// Mock: screens/SCR-103_Create_Edit_Lesson_Plan.html
// Wired: POST /api/v1/school/lesson-plans; with ?id= PUT/DELETE /lesson-plans/{id}, POST /submit, /deliver; GET /syllabus, /syllabus/{cs_id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LessonPlanForm } from "@/features/academics/LessonPlanForm";

export const metadata = { title: "SCR-103 · Create / Edit Lesson Plan · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-103"
      actions={
        <button type="submit" form="lesson-plan-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save lesson plan
        </button>
      }
    >
      <Suspense>
        <LessonPlanForm />
      </Suspense>
    </AppShell>
  );
}
