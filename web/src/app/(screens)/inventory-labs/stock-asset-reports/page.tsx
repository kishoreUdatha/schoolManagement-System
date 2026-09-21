// SCR-245 · Stock & Asset Reports
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 3 · Stories: US-0489 / US-0490
// Mock: screens/SCR-245_Stock_Asset_Reports.html
// Backend: the old frontend served this at /school/inventory/reports — Windowed stock and asset report with charts
// Wired: GET /api/v1/school/analytics/inventory, /inventory/moves?days=. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StockReports } from "@/features/inventory/StockReports";

export const metadata = { title: "SCR-245 · Stock & Asset Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-245" actions={<button type="button" className="btn primary" data-export="">
        <Icon name="download" className="sm" />
        Export report
      </button>}>
      <StockReports />
    </AppShell>
  );
}
