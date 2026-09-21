// SCR-154 · Fee Dashboard
// Module: Fees & Finance · Role: Accountant · Release: MVP · Stories: US-0307 / US-0308
// Mock: screens/SCR-154_Fee_Dashboard.html
// Backend: the old frontend served this at /school/fees/dashboard — Collected against owed, with the month trend
// Wired: GET /api/v1/school/finance/dashboard, /school/accounts/collections, /school/fees/refunds. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FeeDashboard } from "@/features/fees/FeeDashboard";

export const metadata = { title: "SCR-154 · Fee Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-154" actions={<Link href="/fees-finance/fee-collection" className="btn primary">
        <Icon name="arrow" className="sm" />
        Collect fee
      </Link>}>
      <FeeDashboard />
    </AppShell>
  );
}
