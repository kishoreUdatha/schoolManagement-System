// SCR-197 · Vehicle Maintenance & Fuel
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 3 · Stories: US-0393 / US-0394
// Mock: screens/SCR-197_Vehicle_Maintenance_Fuel.html
// Backend: the old frontend served this at /school/transport/vehicles/[id] — Fuel and service entries with odometer
// Wired: GET/POST/DELETE /api/v1/school/transport/vehicles/{id}/logs across GET /transport/vehicles. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { MaintenanceFuel } from "@/features/transport/Vehicles";

export const metadata = { title: "SCR-197 · Vehicle Maintenance & Fuel · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-197" actions={<Link href="/transport/vehicle-maintenance-fuel?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Record fuel or service
        </Link>}>
      <Suspense>
        <MaintenanceFuel />
      </Suspense>
    </AppShell>
  );
}
