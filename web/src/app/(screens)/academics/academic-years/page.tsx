// SCR-092 · Academic Years
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0183 / US-0184
// Mock: screens/SCR-092_Academic_Years.html
// Wired: GET/POST /api/v1/school/academic-years, PATCH/DELETE /academic-years/{id}, POST /{id}/set-current|archive|unarchive, GET /{id}/terms. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AcademicYears } from "@/features/academics/AcademicYears";
import { PageAction } from "@/features/academics/setupKit";

export const metadata = { title: "SCR-092 · Academic Years · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-092"
      actions={
        <>
          <PageAction name="export" icon="download">
            Export
          </PageAction>
          <PageAction name="add" icon="plus" primary>
            Add academic year
          </PageAction>
        </>
      }
    >
      <Suspense>
        <AcademicYears />
      </Suspense>
    </AppShell>
  );
}
