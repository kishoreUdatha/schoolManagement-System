// SCR-012 · Organization Details
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 2 · Stories: US-0023 / US-0024
// Mock: screens/SCR-012_Organization_Details.html
// Backend: the old frontend served this at /super-admin/tenants/[id] — Subscription, schools, usage, payments, suspend
// Wired: GET /api/v1/super-admin/tenants/{id} (?id=), tenants/{id}/usage, tenants/{id}/payments, plans; PATCH tenants/{id}, PATCH tenants/{id}/status, POST tenants/{id}/subscription, POST tenants/{id}/payments. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EditOrganizationLink, OrganizationDetails } from "@/features/platform/OrganizationDetails";

export const metadata = { title: "SCR-012 · Organization Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-012" actions={<Suspense><EditOrganizationLink /></Suspense>}>
      <Suspense>
        <OrganizationDetails />
      </Suspense>
    </AppShell>
  );
}
