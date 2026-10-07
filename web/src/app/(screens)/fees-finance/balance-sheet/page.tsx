// NEW-057 · Balance Sheet
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/balance-sheet?as_of=&account_id= (+ .xlsx, .pdf). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { TallyExport } from "@/features/books/TallyExport";
import { ClientOnly } from "@/features/fees/common";
import { BalanceSheet } from "@/features/books/BalanceSheet";

export const metadata = { title: "NEW-057 · Balance Sheet · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-057" actions={<TallyExport />}>
      <ClientOnly>
        <BalanceSheet />
      </ClientOnly>
    </AppShell>
  );
}
