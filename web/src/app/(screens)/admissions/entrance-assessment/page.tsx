// SCR-052 · Entrance Assessment
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 2 · Stories: US-0103 / US-0104
// Mock: screens/SCR-052_Entrance_Assessment.html
// Wired: GET /api/v1/school/admissions/applications, /applications/{id}, /directory/staff; PUT/DELETE /applications/assessments/{id}; POST /applications/{id}/assessments. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { EntranceAssessment } from "@/features/admissions/EntranceAssessment";

export const metadata = { title: "SCR-052 · Entrance Assessment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-052" actions={<button type="submit" form="assessment-result" className="btn primary">
        <Icon name="check" className="sm" />
        Save assessment
      </button>}>
      <Suspense>
        <EntranceAssessment />
      </Suspense>
    </AppShell>
  );
}
