// SCR-050 · Application Details
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 2 · Stories: US-0099 / US-0100
// Mock: screens/SCR-050_Application_Details.html
// Wired: GET /api/v1/school/admissions/applications/{id} (?id=); POST /submit, /status, /fee, /withdraw. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ApplicationDetails } from "@/features/admissions/ApplicationDetails";
import { WithIdLink } from "@/features/admissions/shared";

export const metadata = { title: "SCR-050 · Application Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-050" actions={<Suspense>
        <WithIdLink screen={51} fallback={51}>
          Review application
        </WithIdLink>
      </Suspense>}>
      <Suspense>
        <ApplicationDetails />
      </Suspense>
    </AppShell>
  );
}
