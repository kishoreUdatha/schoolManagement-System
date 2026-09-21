// SCR-015 · Tenant Usage & Limits
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 2 · Stories: US-0029 / US-0030
// Mock: screens/SCR-015_Tenant_Usage_Limits.html
// Backend: the old frontend served this at /super-admin/usage — Usage against quota, per tenant
// Wired: GET /api/v1/super-admin/usage-overview, billing (?id= picks the organization). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TenantUsage } from "@/features/platform/TenantUsage";

export const metadata = { title: "SCR-015 · Tenant Usage & Limits · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-015" actions={<Link href="/platform/subscription-plans" className="btn primary">
          <Icon name="check" className="sm" />
          Edit limits
        </Link>}>
      <Suspense>
        <TenantUsage />
      </Suspense>
    </AppShell>
  );
}
