// SCR-189 · Routes
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 2 · Stories: US-0377 / US-0378
// Mock: screens/SCR-189_Routes.html
// Backend: the old frontend served this at /school/transport/routes — Route cards with stop table
// Wired: GET /api/v1/school/transport/routes. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { RouteList } from "@/features/transport/Routes";

export const metadata = { title: "SCR-189 · Routes · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-189" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/transport/create-edit-route" className="btn primary">
          <Icon name="plus" className="sm" />
          Create route
        </Link>
      </>}>
      <Suspense>
        <RouteList />
      </Suspense>
    </AppShell>
  );
}
