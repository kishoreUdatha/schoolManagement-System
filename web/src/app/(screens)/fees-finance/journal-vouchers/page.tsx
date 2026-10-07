// NEW-052 · Journal Vouchers
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET/POST /api/v1/school/books/journals (+ .xlsx, .pdf), GET/PUT/DELETE /books/journals/{id}, POST /books/journals/{id}/post, POST /books/journals/{id}/void, GET /books/accounts (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TallyExport } from "@/features/books/TallyExport";
import { ClientOnly } from "@/features/fees/common";
import { JournalVouchers } from "@/features/books/JournalVouchers";

export const metadata = { title: "NEW-052 · Journal Vouchers · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-052" actions={<TallyExport />}>
      <ClientOnly>
        <Suspense>
          <JournalVouchers />
        </Suspense>
      </ClientOnly>
    </AppShell>
  );
}
