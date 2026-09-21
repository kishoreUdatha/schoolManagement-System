// SCR-192 · Drivers & Conductors
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 3 · Stories: US-0383 / US-0384
// Mock: screens/SCR-192_Drivers_Conductors.html
// Backend: the old frontend served this at /school/transport/crew — Drivers and conductors with licence expiry
// Wired: GET/POST /api/v1/school/transport/crew, PATCH/DELETE /transport/crew/{id}; GET /transport/vehicles. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CrewList } from "@/features/transport/People";

export const metadata = { title: "SCR-192 · Drivers & Conductors · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-192" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/transport/drivers-conductors?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Add crew member
        </Link>
      </>}>
      <Suspense>
        <CrewList />
      </Suspense>
    </AppShell>
  );
}
