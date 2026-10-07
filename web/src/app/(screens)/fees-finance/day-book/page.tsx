// NEW-053 · Day Book
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/day-book?from=&to=&voucher_type=&account_id=&branch_id=&department_id=&page= (+ .xlsx, .pdf). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { TallyExport } from "@/features/books/TallyExport";
import { ClientOnly } from "@/features/fees/common";
import { DayBook } from "@/features/books/DayBook";

export const metadata = { title: "NEW-053 · Day Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-053" actions={<TallyExport />}>
      <ClientOnly>
        <DayBook />
      </ClientOnly>
    </AppShell>
  );
}
