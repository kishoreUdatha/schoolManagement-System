// SCR-166 · Income
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0331 / US-0332
// Mock: screens/SCR-166_Income.html
// Backend: the old frontend served this at /school/accounts — Other income with source, mode, void
// Wired: GET/POST /api/v1/school/accounts/income, POST /accounts/income/{id}/void. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { IncomeList } from "@/features/fees/IncomeList";

export const metadata = { title: "SCR-166 · Income · BrightCampus" };

export default function Page() {
  // "Record income" opens a live form, so it sits in the filter bar.
  return (
    <AppShell screen="SCR-166" actions={<button type="button" className="btn" data-export="">
        <Icon name="download" className="sm" />
        Export
      </button>}>
      <ClientOnly>
        <IncomeList />
      </ClientOnly>
    </AppShell>
  );
}
