// SCR-170 · Cash & Bank Book
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0339 / US-0340
// Mock: screens/SCR-170_Cash_Bank_Book.html
// Backend: the old frontend served this at /school/accounts — Cash book by mode across a date range
// Wired: GET /api/v1/school/accounts/cash-book?from=&to=. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { CashBook } from "@/features/fees/CashBook";

export const metadata = { title: "SCR-170 · Cash & Bank Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-170" actions={<button type="button" className="btn primary" data-export="">
        <Icon name="download" className="sm" />
        Export book
      </button>}>
      <ClientOnly>
        <CashBook />
      </ClientOnly>
    </AppShell>
  );
}
