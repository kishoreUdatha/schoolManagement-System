// SCR-239 · Asset Register
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 2 · Stories: US-0477 / US-0478
// Mock: screens/SCR-239_Asset_Register.html
// Backend: the old frontend served this at /school/inventory — Tag, serial, status, cost, warranty, history
// Wired: GET/POST /api/v1/school/inventory/assets, GET /inventory/assets/{id}, POST /inventory/assets/{id}/events, GET /inventory/suppliers, /directory/staff. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AssetRegister } from "@/features/inventory/AssetRegister";

export const metadata = { title: "SCR-239 · Asset Register · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-239" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/inventory-labs/asset-register?new=1" className="btn primary" scroll={false}>
          <Icon name="plus" className="sm" />
          Register asset
        </Link>
      </>}>
      <Suspense>
        <AssetRegister />
      </Suspense>
    </AppShell>
  );
}
