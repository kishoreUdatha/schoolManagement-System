// SCR-054 · Admission Confirmation & Student Creation
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 3 · Stories: US-0107 / US-0108
// Mock: screens/SCR-054_Admission_Confirmation_Student_Creation.html
// Wired: GET /api/v1/school/admissions/applications/{id} (?id=), /classes; POST /applications/{id}/fee, /applications/{id}/admit. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AdmissionConfirmation } from "@/features/admissions/AdmissionConfirmation";

export const metadata = { title: "SCR-054 · Admission Confirmation & Student Creation · BrightCampus" };

export default function Page() {
  return (
    // The form's own "Create student" button is enabled only when the
    // application can be admitted; a header copy could not know that.
    <AppShell screen="SCR-054">
      <Suspense>
        <AdmissionConfirmation />
      </Suspense>
    </AppShell>
  );
}
