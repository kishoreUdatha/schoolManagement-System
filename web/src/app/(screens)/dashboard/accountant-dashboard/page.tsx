// SCR-038 · Accountant Dashboard
// Module: Role Dashboards · Role: Accountant · Release: Phase 2 · Stories: US-0075 / US-0076
// Mock: screens/SCR-038_Accountant_Dashboard.html
// Backend: the old frontend served this at /accountant — Collected today and this month against what is owed
// Wired: GET /api/v1/accountant/dashboard, GET /api/v1/school/fees/refunds. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AccountantDashboard } from "@/features/dashboards/AccountantDashboard";

export const metadata = { title: "SCR-038 · Accountant Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-038" actions={<Link href="/fees-finance/fee-collection" className="btn primary">
        <Icon name="arrow" className="sm" />
        Collect fee
      </Link>}>
      <Suspense>
        <AccountantDashboard />
      </Suspense>
    </AppShell>
  );
}
