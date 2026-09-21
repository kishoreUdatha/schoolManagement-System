// NEW-002 · Admission Campaigns
// Module: Admissions & Enquiries · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/admissions/campaigns, PATCH/DELETE /admissions/campaigns/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AdmissionCampaigns } from "@/features/admissions/AdmissionCampaigns";
import { ActionButton } from "@/features/admissions/shared";

export const metadata = { title: "NEW-002 · Admission Campaigns · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-002" actions={<ActionButton name="new-campaign" icon="plus">New campaign</ActionButton>}>
      <Suspense>
        <AdmissionCampaigns />
      </Suspense>
    </AppShell>
  );
}
