// NEW-040 · Fee Heads
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/fees/heads, PATCH/DELETE /fees/heads/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FeeHeads } from "@/features/fees/FeeHeads";

export const metadata = { title: "NEW-040 · Fee Heads · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-040" actions={<>
        <Link href="/fees-finance/fee-structure" className="btn">
          <Icon name="file" className="sm" />
          Fee structure
        </Link>
        <Link href="/fees-finance/fee-heads?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Add fee head
        </Link>
      </>}>
      <Suspense>
        <FeeHeads />
      </Suspense>
    </AppShell>
  );
}
