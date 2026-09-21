// NEW-072 · Transport Dashboard
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/transport — Fleet, routes, riders, today's trips, monthly fees
// Wired: GET /api/v1/school/transport/dashboard, /transport/trips (?on=today), /transport/routes, /fees/heads; POST /transport/fees/generate. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TransportDashboard } from "@/features/transport/Dashboard";

export const metadata = { title: "NEW-072 · Transport Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-072"
      actions={
        <Link href="/transport/transport-dashboard?new=1" className="btn primary" scroll={false}>
          <Icon name="money" className="sm" />
          Raise monthly fees
        </Link>
      }
    >
      <Suspense>
        <TransportDashboard />
      </Suspense>
    </AppShell>
  );
}
