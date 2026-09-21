// SCR-171 · Finance Reports
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0341 / US-0342
// Mock: screens/SCR-171_Finance_Reports.html
// Backend: the old frontend served this at /school/accounts/reports — Income against expenditure over a window
// Wired: GET /api/v1/school/finance/report?from=&to=, /school/analytics/fee-collection.csv. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { FinanceReports } from "@/features/fees/FinanceReports";

export const metadata = { title: "SCR-171 · Finance Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-171" actions={<button type="button" className="btn primary" data-export="">
        <Icon name="download" className="sm" />
        Export report
      </button>}>
      <ClientOnly>
        <FinanceReports />
      </ClientOnly>
    </AppShell>
  );
}
