// SCR-050 · Application Details
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 2 · Stories: US-0099 / US-0100
// Mock: screens/SCR-050_Application_Details.html
// Wired: GET /api/v1/school/admissions/applications/{id} (?id=); POST /submit, /status, /fee, /withdraw; multipart POST /applications/{id}/documents, GET /applications/documents/{doc}/file, DELETE /applications/documents/{doc}; edit links to SCR-049 ?id= (PUT /applications/{id}). ?tab= adds SCR-051, SCR-052 and SCR-053's content below the same header. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ApplicationDetails, ApplicationDetailsActions } from "@/features/admissions/ApplicationDetails";

export const metadata = { title: "SCR-050 · Application Details · BrightCampus" };

export default function Page() {
  return (
    // The page-head button follows ?tab=: what that tab's own screen offers.
    <AppShell screen="SCR-050" actions={<Suspense>
        <ApplicationDetailsActions />
      </Suspense>}>
      <Suspense>
        <ApplicationDetails />
      </Suspense>
    </AppShell>
  );
}
