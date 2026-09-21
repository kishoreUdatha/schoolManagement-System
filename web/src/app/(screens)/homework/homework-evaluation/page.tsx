// SCR-133 · Homework Evaluation
// Module: Homework & Assignments · Role: Teacher · Release: MVP · Stories: US-0265 / US-0266
// Mock: screens/SCR-133_Homework_Evaluation.html
// Wired: GET /api/v1/teacher/homework/{id}/submissions (?id=&sub=); PUT .../submissions/{id}/rubric-scores; PATCH .../submissions/{id}/review. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HomeworkEvaluation } from "@/features/homework/HomeworkEvaluation";

export const metadata = { title: "SCR-133 · Homework Evaluation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-133" actions={<button type="submit" form="evaluation-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save evaluation
      </button>}>
      <Suspense>
        <HomeworkEvaluation />
      </Suspense>
    </AppShell>
  );
}
