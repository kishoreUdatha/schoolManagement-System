// NEW-055 · Trial Balance
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/trial-balance?from=&to=. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { TrialBalance } from "@/features/books/Statements";

export const metadata = { title: "NEW-055 · Trial Balance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-055">
      <ClientOnly>
        <TrialBalance />
      </ClientOnly>
    </AppShell>
  );
}
