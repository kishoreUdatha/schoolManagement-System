// NEW-048 · School Store Sales
// Module: Inventory / Assets / Labs · Role: Store Keeper · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/inventory/store/sales, POST /inventory/store/sales/{id}/void; GET /inventory/dashboard, /inventory/items?sellable_only=true, /fees/heads, /directory/students. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { StoreSales } from "@/features/store/StoreSales";

export const metadata = { title: "NEW-048 · School Store Sales · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-048" actions={<>
        <Link href="/inventory-labs/item-catalogue" className="btn">
          <Icon name="book" className="sm" />
          Item catalogue
        </Link>
        <Link href="/inventory-labs/school-store-sales?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          New sale
        </Link>
      </>}>
      <Suspense>
        <ClientOnly>
          <StoreSales />
        </ClientOnly>
      </Suspense>
    </AppShell>
  );
}
