// SCR-237 · Stock Issue / Return
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 2 · Stories: US-0473 / US-0474
// Mock: screens/SCR-237_Stock_Issue_Return.html
// Backend: the old frontend served this at /school/inventory/issues — Issue and return register over free-text issued-to
// Wired: POST /api/v1/school/inventory/moves (issue, return_in, damage), GET /inventory/items, /inventory/moves. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StockIssue } from "@/features/inventory/StockIssue";

export const metadata = { title: "SCR-237 · Stock Issue / Return · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-237" actions={<button type="submit" form="movement-form" className="btn primary">
        <Icon name="check" className="sm" />
        Record movement
      </button>}>
      <StockIssue />
    </AppShell>
  );
}
