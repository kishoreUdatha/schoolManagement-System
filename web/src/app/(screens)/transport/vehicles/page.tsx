// SCR-186 · Vehicles
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 2 · Stories: US-0371 / US-0372
// Mock: screens/SCR-186_Vehicles.html
// Backend: the old frontend served this at /school/transport/vehicles — Fleet table with document expiry and CRUD
// Wired: GET /api/v1/school/transport/vehicles, /transport/routes. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VehicleList } from "@/features/transport/Vehicles";

export const metadata = { title: "SCR-186 · Vehicles · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-186" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/transport/add-edit-vehicle" className="btn primary">
          <Icon name="plus" className="sm" />
          Add vehicle
        </Link>
      </>}>
      <Suspense>
        <VehicleList />
      </Suspense>
    </AppShell>
  );
}
