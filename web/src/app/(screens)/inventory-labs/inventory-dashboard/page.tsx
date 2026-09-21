// SCR-234 · Inventory Dashboard
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 2 · Stories: US-0467 / US-0468
// Mock: screens/SCR-234_Inventory_Dashboard.html
// Backend: the old frontend served this at /school/inventory — Dashboard tiles, low stock, warranty list
// Wired: GET /api/v1/school/inventory/dashboard, /analytics/inventory, /inventory/moves, /inventory/assignments, /inventory/assets, /lab-bookings. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { InventoryDashboard } from "@/features/inventory/InventoryDashboard";

export const metadata = { title: "SCR-234 · Inventory Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-234" actions={<Link href="/inventory-labs/stock-in-purchase-receipt" className="btn primary">
        <Icon name="arrow" className="sm" />
        Record stock in
      </Link>}>
      <InventoryDashboard />
    </AppShell>
  );
}
