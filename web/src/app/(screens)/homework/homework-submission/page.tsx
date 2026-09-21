// SCR-132 · Homework Submission
// Module: Homework & Assignments · Role: Student · Release: MVP · Stories: US-0263 / US-0264
// Mock: screens/SCR-132_Homework_Submission.html
// Wired: GET + POST/PATCH /api/v1/student/homework/{id}/submission (?id=); parent: /parent/me/children/{child}/homework/{id}/submission. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HomeworkSubmission } from "@/features/homework/HomeworkSubmission";

export const metadata = { title: "SCR-132 · Homework Submission · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-132" actions={<button type="submit" form="submission-form" className="btn primary">
        <Icon name="check" className="sm" />
        Submit homework
      </button>}>
      <Suspense>
        <HomeworkSubmission />
      </Suspense>
    </AppShell>
  );
}
