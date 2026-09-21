// SCR-093 · Terms / Semesters
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0185 / US-0186
// Mock: screens/SCR-093_Terms_Semesters.html
// Wired: GET /api/v1/school/academic-years, GET/POST /academic-years/{id}/terms, PUT /academic-years/{id}/terms/{term_id}, DELETE /terms/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/academics/setupKit";
import { Terms } from "@/features/academics/Terms";

export const metadata = { title: "SCR-093 · Terms / Semesters · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-093"
      actions={
        <>
          <PageAction name="export" icon="download">
            Export
          </PageAction>
          <PageAction name="add" icon="plus" primary>
            Add term
          </PageAction>
        </>
      }
    >
      <Suspense>
        <Terms />
      </Suspense>
    </AppShell>
  );
}
