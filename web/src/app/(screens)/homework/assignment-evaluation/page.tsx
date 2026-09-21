// SCR-137 · Assignment Evaluation
// Module: Homework & Assignments · Role: Teacher · Release: Phase 3 · Stories: US-0273 / US-0274
// Mock: screens/SCR-137_Assignment_Evaluation.html
// Wired: GET /api/v1/teacher/projects, .../{id}/progress (?id=&progress=); PATCH /teacher/projects/progress/{id}/review. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ProjectEvaluation } from "@/features/homework/ProjectEvaluation";

export const metadata = { title: "SCR-137 · Assignment Evaluation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-137" actions={<button type="submit" form="evaluation-form" className="btn primary">
        <Icon name="check" className="sm" />
        Publish feedback
      </button>}>
      <Suspense>
        <ProjectEvaluation />
      </Suspense>
    </AppShell>
  );
}
