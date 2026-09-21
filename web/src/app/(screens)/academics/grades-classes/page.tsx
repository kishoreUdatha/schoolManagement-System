// SCR-094 · Grades / Classes
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0187 / US-0188
// Mock: screens/SCR-094_Grades_Classes.html
// Wired: GET/POST /api/v1/school/classes, PATCH/DELETE /classes/{id}, POST /classes/reorder, POST /classes/{id}/sections, GET /students (counts). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Classes } from "@/features/academics/Classes";
import { PageAction } from "@/features/academics/setupKit";

export const metadata = { title: "SCR-094 · Grades / Classes · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-094"
      actions={
        <>
          <PageAction name="export" icon="download">
            Export
          </PageAction>
          <PageAction name="add" icon="plus" primary>
            Add class
          </PageAction>
        </>
      }
    >
      <Suspense>
        <Classes />
      </Suspense>
    </AppShell>
  );
}
