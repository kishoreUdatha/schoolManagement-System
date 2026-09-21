// SCR-009 · Platform Dashboard
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: MVP · Stories: US-0017 / US-0018
// Mock: screens/SCR-009_Platform_Dashboard.html
// Backend: the old frontend served this at /super-admin — Usage counters, renewals, CSV export
// Wired: GET /api/v1/super-admin/usage/summary, usage/renewals?within_days=30, health, tickets, tenants?page_size=3. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PlatformDashboard } from "@/features/platform/PlatformDashboard";

export const metadata = { title: "SCR-009 · Platform Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-009" actions={<Link href="/platform/organizations-list" className="btn primary">
          <Icon name="arrow" className="sm" />
          View organizations
        </Link>}>
      <Suspense>
        <PlatformDashboard />
      </Suspense>
    </AppShell>
  );
}
