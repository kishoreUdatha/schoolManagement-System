// SCR-135 · Create Assignment
// Module: Homework & Assignments · Role: Teacher · Release: Phase 2 · Stories: US-0269 / US-0270
// Mock: screens/SCR-135_Create_Assignment.html
// Wired: POST /api/v1/teacher/projects, GET /teacher/my-classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { WorkForm } from "@/features/homework/WorkForm";

export const metadata = { title: "SCR-135 · Create Assignment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-135" actions={<button type="submit" form="work-form" className="btn primary">
        <Icon name="check" className="sm" />
        Publish assignment
      </button>}>
      <Suspense>
        <WorkForm kind="project" />
      </Suspense>
    </AppShell>
  );
}
