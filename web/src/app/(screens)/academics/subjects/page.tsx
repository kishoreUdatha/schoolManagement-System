// SCR-096 · Subjects
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0191 / US-0192
// Mock: screens/SCR-096_Subjects.html
// Wired: GET/POST /api/v1/school/subjects, PATCH/DELETE /subjects/{id}, GET /departments, GET/POST /classes/{id}/subjects, DELETE /class-subjects/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/academics/setupKit";
import { Subjects } from "@/features/academics/Subjects";

export const metadata = { title: "SCR-096 · Subjects · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-096"
      actions={
        <>
          <PageAction name="export" icon="download">
            Export
          </PageAction>
          <PageAction name="add" icon="plus" primary>
            Add subject
          </PageAction>
        </>
      }
    >
      <Suspense>
        <Subjects />
      </Suspense>
    </AppShell>
  );
}
