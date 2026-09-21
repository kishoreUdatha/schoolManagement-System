// SCR-187 · Add / Edit Vehicle
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 2 · Stories: US-0373 / US-0374
// Mock: screens/SCR-187_Add_Edit_Vehicle.html
// Backend: the old frontend served this at /school/transport/vehicles — Create and edit with four document expiries
// Wired: POST /api/v1/school/transport/vehicles; GET + PATCH /transport/vehicles/{id} (?id=); GET /transport/crew. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VehicleForm } from "@/features/transport/Vehicles";

export const metadata = { title: "SCR-187 · Add / Edit Vehicle · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-187" actions={<button type="submit" form="vehicle-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save vehicle
        </button>}>
      <Suspense>
        <VehicleForm />
      </Suspense>
    </AppShell>
  );
}
