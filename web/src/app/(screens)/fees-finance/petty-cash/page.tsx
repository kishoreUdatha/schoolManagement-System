// NEW-098 · Petty Cash
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/accounts/petty-cash, POST …/spend, …/topup, …/{id}/void, PUT …/float. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { PettyCash } from "@/features/fees/PettyCash";

export const metadata = { title: "NEW-098 · Petty Cash · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-098">
      <ClientOnly>
        <PettyCash />
      </ClientOnly>
    </AppShell>
  );
}
