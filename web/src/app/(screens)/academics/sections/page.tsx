// SCR-095 · Sections
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0189 / US-0190
// Mock: screens/SCR-095_Sections.html
// Wired: GET /api/v1/school/classes (nested sections), POST /classes/{id}/sections, PATCH/DELETE /sections/{id}, GET /staff?role=teacher, GET /students (counts). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Sections } from "@/features/academics/Sections";
import { PageAction } from "@/features/academics/setupKit";

export const metadata = { title: "SCR-095 · Sections · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-095"
      actions={
        <>
          <PageAction name="export" icon="download">
            Export
          </PageAction>
          <PageAction name="add" icon="plus" primary>
            Add section
          </PageAction>
        </>
      }
    >
      <Suspense>
        <Sections />
      </Suspense>
    </AppShell>
  );
}
