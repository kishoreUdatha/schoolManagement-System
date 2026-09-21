// SCR-236 · Stock In / Purchase Receipt
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 2 · Stories: US-0471 / US-0472
// Mock: screens/SCR-236_Stock_In_Purchase_Receipt.html
// Backend: the old frontend served this at /school/inventory/receipts — Multi-line receipt; says lines are recorded individually
// Wired: POST /api/v1/school/inventory/moves (one per line), GET /inventory/items, /inventory/suppliers, /inventory/moves. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StockReceipt } from "@/features/inventory/StockReceipt";

export const metadata = { title: "SCR-236 · Stock In / Purchase Receipt · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-236" actions={<button type="submit" form="receipt-form" className="btn primary">
        <Icon name="check" className="sm" />
        Receive stock
      </button>}>
      <StockReceipt />
    </AppShell>
  );
}
