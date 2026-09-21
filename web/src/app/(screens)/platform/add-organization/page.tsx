// SCR-011 · Add Organization
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: MVP · Stories: US-0021 / US-0022
// Mock: screens/SCR-011_Add_Organization.html
// Backend: the old frontend served this at /super-admin/tenants — Creates tenant, school and admin
// Wired: POST /api/v1/super-admin/tenants, then POST tenants/{id}/subscription when a plan is picked; GET plans. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AddOrganization } from "@/features/platform/AddOrganization";

export const metadata = { title: "SCR-011 · Add Organization · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-011" actions={<button type="submit" form="org-form" className="btn primary">
          <Icon name="check" className="sm" />
          Create organization
        </button>}>
      <Suspense>
        <AddOrganization />
      </Suspense>
    </AppShell>
  );
}
