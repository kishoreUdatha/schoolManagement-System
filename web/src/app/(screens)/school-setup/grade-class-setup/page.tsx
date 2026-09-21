// SCR-029 · Grade / Class Setup
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: Phase 2 · Stories: US-0057 / US-0058
// Mock: screens/SCR-029_Grade_Class_Setup.html
// Wired: GET/POST /api/v1/school/classes, PATCH/DELETE /classes/{id}, GET /academic-years, /branches (?id=&year=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ClassSetup } from "@/features/setup/ClassSetup";
import { SubmitFor } from "@/features/setup/bits";

export const metadata = { title: "SCR-029 · Grade / Class Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-029" actions={<SubmitFor form="class-form">Save class</SubmitFor>}>
      <Suspense>
        <ClassSetup />
      </Suspense>
    </AppShell>
  );
}
