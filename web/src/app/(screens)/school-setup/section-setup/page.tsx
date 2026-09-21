// SCR-030 · Section Setup
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: Phase 2 · Stories: US-0059 / US-0060
// Mock: screens/SCR-030_Section_Setup.html
// Wired: GET /api/v1/school/classes, POST /classes/{id}/sections, PATCH/DELETE /sections/{id}, GET /staff?role=teacher, /academic-years, /branches (?id=&year=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SectionSetup } from "@/features/setup/SectionSetup";
import { SubmitFor } from "@/features/setup/bits";

export const metadata = { title: "SCR-030 · Section Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-030" actions={<SubmitFor form="section-form">Save section</SubmitFor>}>
      <Suspense>
        <SectionSetup />
      </Suspense>
    </AppShell>
  );
}
