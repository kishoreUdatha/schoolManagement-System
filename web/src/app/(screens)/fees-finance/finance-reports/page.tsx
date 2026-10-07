// SCR-171 · Finance Reports
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0341 / US-0342
// Mock: screens/SCR-171_Finance_Reports.html
// Backend: the old frontend served this at /school/accounts/reports — Income against expenditure over a window
// Wired: GET /api/v1/school/finance/report?from=&to=, /finance/reports/* (month-wise collections, dues by class / branch,
// students by fee type, concessions, bounced cheques, reminder-slips.pdf), /school/analytics/fee-collection.csv. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { FeeReports } from "@/features/fees/FeeReports";

export const metadata = { title: "SCR-171 · Finance Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-171" actions={<button type="button" className="btn primary" data-export="">
        <Icon name="download" className="sm" />
        Export report
      </button>}>
      <ClientOnly>
        <FeeReports />
      </ClientOnly>
    </AppShell>
  );
}
