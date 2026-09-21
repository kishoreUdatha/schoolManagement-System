// SCR-240 · Asset Assignment / Transfer
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 3 · Stories: US-0479 / US-0480
// Mock: screens/SCR-240_Asset_Assignment_Transfer.html
// Backend: the old frontend served this at /school/inventory — Assignments tab: what is out and with whom
// Wired: GET /api/v1/school/inventory/assignments, /inventory/assets, /inventory/assets/{id}, POST /inventory/assets/{id}/events, GET /directory/staff. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AssetAssignments } from "@/features/inventory/AssetAssignments";

export const metadata = { title: "SCR-240 · Asset Assignment / Transfer · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-240" actions={<Link href="/inventory-labs/asset-assignment-transfer?new=1" className="btn primary" scroll={false}>
        <Icon name="check" className="sm" />
        Transfer asset
      </Link>}>
      <Suspense>
        <AssetAssignments />
      </Suspense>
    </AppShell>
  );
}
