// SCR-188 · Vehicle Details
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 2 · Stories: US-0375 / US-0376
// Mock: screens/SCR-188_Vehicle_Details.html
// Backend: the old frontend served this at /school/transport/vehicles/[id] — Expiries flagged, fuel and service log
// Wired: GET /api/v1/school/transport/vehicles/{id} (?id=), …/logs, /transport/routes, /transport/crew; POST …/gps-key; DELETE /transport/vehicles/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { VehicleDetails, WithIdLink } from "@/features/transport/Vehicles";

export const metadata = { title: "SCR-188 · Vehicle Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-188" actions={<Suspense>
        <WithIdLink screen={187} fallback={186} icon="arrow">
          Edit vehicle
        </WithIdLink>
      </Suspense>}>
      <Suspense>
        <VehicleDetails />
      </Suspense>
    </AppShell>
  );
}
