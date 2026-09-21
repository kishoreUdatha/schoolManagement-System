// SCR-194 · Trip Sheet
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 3 · Stories: US-0387 / US-0388
// Mock: screens/SCR-194_Trip_Sheet.html
// Backend: the old frontend served this at /school/transport/trips/[id] — Generate sheets, start, complete, odometer
// Wired: GET /api/v1/school/transport/trips (?on=), POST /trips/generate, GET + PATCH /trips/{id} (?id=), GET /routes/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TripSheet } from "@/features/transport/Trips";

export const metadata = { title: "SCR-194 · Trip Sheet · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-194">
      <Suspense>
        <TripSheet />
      </Suspense>
    </AppShell>
  );
}
