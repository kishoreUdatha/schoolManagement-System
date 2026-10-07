// NEW-102 · Fee Overview
// Module: Fees & Finance · Role: Principal · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/finance/overview (read-only). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { FeeOverview } from "@/features/fees/FeeOverview";

export const metadata = { title: "NEW-102 · Fee Overview · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-102">
      <ClientOnly>
        <FeeOverview />
      </ClientOnly>
    </AppShell>
  );
}
