// SCR-129 · Create Homework
// Module: Homework & Assignments · Role: Teacher · Release: MVP · Stories: US-0257 / US-0258
// Mock: screens/SCR-129_Create_Homework.html
// Wired: POST /api/v1/teacher/homework (PATCH /teacher/homework/{id} with ?id=), GET /teacher/my-classes, /school/rubrics. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { WorkForm } from "@/features/homework/WorkForm";

export const metadata = { title: "SCR-129 · Create Homework · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-129" actions={<button type="submit" form="work-form" className="btn primary">
        <Icon name="check" className="sm" />
        Publish homework
      </button>}>
      <Suspense>
        <WorkForm kind="homework" />
      </Suspense>
    </AppShell>
  );
}
