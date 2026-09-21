// SCR-190 · Create / Edit Route
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 2 · Stories: US-0379 / US-0380
// Mock: screens/SCR-190_Create_Edit_Route.html
// Backend: the old frontend served this at /school/transport/routes — Route editor with reorderable stops
// Wired: POST /api/v1/school/transport/routes; GET + PATCH + DELETE /transport/routes/{id} (?id=); GET /transport/vehicles. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { RouteBuilder } from "@/features/transport/Routes";

export const metadata = { title: "SCR-190 · Create / Edit Route · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-190" actions={<button type="submit" form="route-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save route
        </button>}>
      <Suspense>
        <RouteBuilder />
      </Suspense>
    </AppShell>
  );
}
