// NEW-056 · Income & Expenditure
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/income-expenditure?from=&to=&category=&account_id= (+ .xlsx, .pdf). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { IncomeExpenditure } from "@/features/books/IncomeExpenditure";

export const metadata = { title: "NEW-056 · Income & Expenditure · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-056">
      <ClientOnly>
        <IncomeExpenditure />
      </ClientOnly>
    </AppShell>
  );
}
