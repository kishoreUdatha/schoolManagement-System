// SCR-195 · Live GPS Tracking
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 3 · Stories: US-0389 / US-0390
// Mock: screens/SCR-195_Live_GPS_Tracking.html
// Backend: the old frontend served this at /school/transport/live — Last reported position, staleness stated
// Wired: GET /api/v1/school/transport/vehicles (last position), /vehicles/{id}/locations (?on=today), /routes, /trips (?on=today). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LiveTracking } from "@/features/transport/Trips";

export const metadata = { title: "SCR-195 · Live GPS Tracking · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-195" actions={<Link href="/transport/trip-sheet" className="btn primary">
          <Icon name="arrow" className="sm" />
          View trip sheet
        </Link>}>
      <Suspense>
        <LiveTracking />
      </Suspense>
    </AppShell>
  );
}
