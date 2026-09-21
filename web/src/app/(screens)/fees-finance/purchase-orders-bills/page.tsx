// NEW-047 · Purchase Orders & Bills
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/finance/orders, POST /finance/orders/{id}/receive, GET/POST /finance/bills, GET /finance/payables, /inventory/suppliers, /inventory/items. Payment stays on SCR-169. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PurchaseOrders } from "@/features/fees/PurchaseOrders";

export const metadata = { title: "NEW-047 · Purchase Orders & Bills · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-047" actions={<>
        <Link href="/fees-finance/purchase-orders-bills?new=bill" className="btn">
          <Icon name="file" className="sm" />
          Record bill
        </Link>
        <Link href="/fees-finance/purchase-orders-bills?new=order" className="btn primary">
          <Icon name="plus" className="sm" />
          Raise order
        </Link>
      </>}>
      <Suspense>
        <PurchaseOrders />
      </Suspense>
    </AppShell>
  );
}
