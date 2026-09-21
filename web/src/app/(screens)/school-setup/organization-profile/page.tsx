// SCR-021 · Organization Profile
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0041 / US-0042
// Mock: screens/SCR-021_Organization_Profile.html
// Wired: GET/PATCH /api/v1/super-admin/tenants/{id} (?id=, ?edit=1), GET /tenants/{id}/usage, /super-admin/plans. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EditOrganizationLink, OrganizationProfile } from "@/features/setup/Organizations";

export const metadata = { title: "SCR-021 · Organization Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-021"
      actions={
        <Suspense>
          <EditOrganizationLink />
        </Suspense>
      }
    >
      <Suspense>
        <OrganizationProfile />
      </Suspense>
    </AppShell>
  );
}
