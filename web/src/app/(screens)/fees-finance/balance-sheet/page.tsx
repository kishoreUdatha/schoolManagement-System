// NEW-057 · Balance Sheet
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/balance-sheet?as_of=. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { BalanceSheet } from "@/features/books/Statements";

export const metadata = { title: "NEW-057 · Balance Sheet · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-057">
      <ClientOnly>
        <BalanceSheet />
      </ClientOnly>
    </AppShell>
  );
}
