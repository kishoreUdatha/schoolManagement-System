// NEW-101 · Bank Reconciliation
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/books/bank-rec/statements, GET/DELETE …/{id}, POST …/{id}/auto-match,
// POST /bank-rec/lines/{id}/{match, unmatch, ignore, record}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { BankReconciliation } from "@/features/fees/BankReconciliation";

export const metadata = { title: "NEW-101 · Bank Reconciliation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-101">
      <ClientOnly>
        <Suspense>
          <BankReconciliation />
        </Suspense>
      </ClientOnly>
    </AppShell>
  );
}
