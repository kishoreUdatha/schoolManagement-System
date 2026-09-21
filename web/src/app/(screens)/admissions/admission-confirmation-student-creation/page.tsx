// SCR-054 · Admission Confirmation & Student Creation
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 3 · Stories: US-0107 / US-0108
// Mock: screens/SCR-054_Admission_Confirmation_Student_Creation.html
// Wired: GET /api/v1/school/admissions/applications/{id} (?id=), /classes; POST /applications/{id}/fee, /applications/{id}/admit. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AdmissionConfirmation } from "@/features/admissions/AdmissionConfirmation";

export const metadata = { title: "SCR-054 · Admission Confirmation & Student Creation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-054" actions={<button type="submit" form="admit-form" className="btn primary">
        <Icon name="check" className="sm" />
        Create student
      </button>}>
      <Suspense>
        <AdmissionConfirmation />
      </Suspense>
    </AppShell>
  );
}
