// SCR-241 · Asset Maintenance
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 3 · Stories: US-0481 / US-0482
// Mock: screens/SCR-241_Asset_Maintenance.html
// Backend: the old frontend served this at /school/inventory/maintenance — Service interval; no interval means not due, not overdue
// Wired: GET /api/v1/school/inventory/assets, /inventory/assets/{id}, POST /inventory/assets/{id}/events, GET /ops/assets/service-due, PUT /ops/assets/{id}/service-interval. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AssetMaintenance } from "@/features/inventory/AssetMaintenance";

export const metadata = { title: "SCR-241 · Asset Maintenance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-241" actions={<Link href="/inventory-labs/asset-maintenance?new=1" className="btn primary" scroll={false}>
        <Icon name="check" className="sm" />
        Log maintenance
      </Link>}>
      <Suspense>
        <AssetMaintenance />
      </Suspense>
    </AppShell>
  );
}
