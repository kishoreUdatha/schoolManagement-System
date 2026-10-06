// NEW-054 · General Ledger
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/accounts/{id}/ledger?from=&to= (+ .xlsx, .pdf), GET /books/accounts (?account=&from=&to=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { GeneralLedger } from "@/features/books/Ledger";

export const metadata = { title: "NEW-054 · General Ledger · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-054">
      <ClientOnly>
        <Suspense>
          <GeneralLedger />
        </Suspense>
      </ClientOnly>
    </AppShell>
  );
}
