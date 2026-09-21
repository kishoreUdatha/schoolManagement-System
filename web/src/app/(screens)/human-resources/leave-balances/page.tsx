// NEW-061 · Leave Balances
// Module: HR / Leave / Payroll · Role: HR Manager · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/hr/leave-balances (?year=), GET /hr/leave-types, PATCH /hr/leave-balances/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LeaveBalances } from "@/features/hr/LeaveBalances";
import { routeOf } from "@/lib/screens";

export const metadata = { title: "NEW-061 · Leave Balances · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-061"
      actions={
        <Link href={routeOf(180)} className="btn primary">
          <Icon name="calendar" className="sm" />
          Allot leave for a year
        </Link>
      }
    >
      <Suspense>
        <LeaveBalances />
      </Suspense>
    </AppShell>
  );
}
