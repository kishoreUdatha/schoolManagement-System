// NEW-100 · Previous Year Dues
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/fees/previous-dues, DELETE …/{fee_id}. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { PreviousDues } from "@/features/fees/PreviousDues";

export const metadata = { title: "NEW-100 · Previous Year Dues · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-100">
      <ClientOnly>
        <PreviousDues />
      </ClientOnly>
    </AppShell>
  );
}
