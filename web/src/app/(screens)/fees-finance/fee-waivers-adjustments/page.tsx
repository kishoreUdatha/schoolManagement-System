// NEW-042 · Fee Waivers & Adjustments
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/fees/student-fees, PATCH /fees/student-fees/{id}, POST /fees/student-fees/{id}/waive, GET /finance/ledger/{student_id}, /directory/students. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FeeWaivers } from "@/features/fees/FeeWaivers";

export const metadata = { title: "NEW-042 · Fee Waivers & Adjustments · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-042" actions={<>
        <Link href="/fees-finance/concession-scholarship" className="btn">
          <Icon name="money" className="sm" />
          Concessions
        </Link>
        <Link href="/fees-finance/refunds" className="btn">
          <Icon name="arrow" className="sm" />
          Refunds
        </Link>
      </>}>
      <Suspense>
        <FeeWaivers />
      </Suspense>
    </AppShell>
  );
}
