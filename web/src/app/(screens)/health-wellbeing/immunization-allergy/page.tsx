// SCR-220 · Immunization / Allergy
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0439 / US-0440
// Mock: screens/SCR-220_Immunization_Allergy.html
// Backend: the old frontend served this at /school/health/immunisation — Bulk entry for a drive, capped per section
// Wired: GET /api/v1/school/health/students/{id} (?id=), POST …/immunizations, DELETE /health/immunizations/{id}; GET /health/immunizations-due, /health/alerts, /classes; POST /wellbeing/immunisation/bulk. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ImmunizationAllergy, AddImmunizationLink } from "@/features/health/Clinic";

export const metadata = { title: "SCR-220 · Immunization / Allergy · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-220" actions={<Suspense>
        <AddImmunizationLink />
      </Suspense>}>
      <Suspense>
        <ImmunizationAllergy />
      </Suspense>
    </AppShell>
  );
}
