// SCR-028 · Academic Year Setup
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0055 / US-0056
// Mock: screens/SCR-028_Academic_Year_Setup.html
// Wired: GET/POST /api/v1/school/academic-years, PATCH/DELETE /academic-years/{id}, POST /{id}/set-current|archive|unarchive, GET /{id}/terms, GET /branches (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AcademicYearSetup } from "@/features/setup/AcademicYearSetup";
import { SubmitFor } from "@/features/setup/bits";

export const metadata = { title: "SCR-028 · Academic Year Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-028" actions={<SubmitFor form="year-form">Save academic year</SubmitFor>}>
      <Suspense>
        <AcademicYearSetup />
      </Suspense>
    </AppShell>
  );
}
