// SCR-235 · Item Catalogue
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 2 · Stories: US-0469 / US-0470
// Mock: screens/SCR-235_Item_Catalogue.html
// Backend: the old frontend served this at /school/inventory — Item list, search, SKU, reorder level
// Wired: GET/POST /api/v1/school/inventory/items, PUT /inventory/items/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ItemCatalogue } from "@/features/inventory/ItemCatalogue";

export const metadata = { title: "SCR-235 · Item Catalogue · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-235" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/inventory-labs/item-catalogue?new=1" className="btn primary" scroll={false}>
          <Icon name="plus" className="sm" />
          Add item
        </Link>
      </>}>
      <Suspense>
        <ItemCatalogue />
      </Suspense>
    </AppShell>
  );
}
