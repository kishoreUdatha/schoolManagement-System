// SCR-191 · Stops
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 2 · Stories: US-0381 / US-0382
// Mock: screens/SCR-191_Stops.html
// Backend: the old frontend served this at /school/transport/routes/[id] — Stops in order with times, and the riders
// Wired: GET /api/v1/school/transport/routes (stops of every route). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StopList } from "@/features/transport/Routes";

export const metadata = { title: "SCR-191 · Stops · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-191" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/transport/create-edit-route" className="btn primary">
          <Icon name="plus" className="sm" />
          Add stop
        </Link>
      </>}>
      <Suspense>
        <StopList />
      </Suspense>
    </AppShell>
  );
}
