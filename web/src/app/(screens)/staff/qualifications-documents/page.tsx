// SCR-087 · Qualification check (was Qualifications & Documents)
// Module: Teachers & Staff · Role: School Admin · Release: Phase 2 · Stories: US-0173 / US-0174
// Mock: screens/SCR-087_Qualifications_Documents.html
// Wired: GET /api/v1/school/staff-ops/qualifications. Adding and verifying live on the staff profile's
// Documents tab (SCR-082 ?tab=documents); ?id= here forwards there. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { QualificationCheck } from "@/features/staff/StaffQualifications";

export const metadata = { title: "SCR-087 · Qualification check · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-087">
      <Suspense>
        <QualificationCheck />
      </Suspense>
    </AppShell>
  );
}
