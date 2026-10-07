// NEW-055 · Trial Balance
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock): books of account (double entry)
// Wired: GET /api/v1/school/books/trial-balance?from=&to=&account_id= (+ .xlsx, .pdf). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { TallyExport } from "@/features/books/TallyExport";
import { ClientOnly } from "@/features/fees/common";
import { TrialBalance } from "@/features/books/TrialBalance";

export const metadata = { title: "NEW-055 · Trial Balance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-055" actions={<TallyExport />}>
      <ClientOnly>
        <TrialBalance />
      </ClientOnly>
    </AppShell>
  );
}
