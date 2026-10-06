// NEW-049 · Chart of Accounts
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET/POST /api/v1/school/books/accounts, PATCH/DELETE /books/accounts/{id}, POST /books/accounts/import, GET /books/accounts.xlsx. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { ChartOfAccounts } from "@/features/books/ChartOfAccounts";

export const metadata = { title: "NEW-049 · Chart of Accounts · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-049">
      <ClientOnly>
        <ChartOfAccounts />
      </ClientOnly>
    </AppShell>
  );
}
