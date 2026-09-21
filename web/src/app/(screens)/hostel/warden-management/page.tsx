// SCR-211 · Warden Management
// Module: Hostel · Role: Hostel Warden · Release: Phase 3 · Stories: US-0421 / US-0422
// Mock: screens/SCR-211_Warden_Management.html
// Backend: the old frontend served this at /school/hostel/wardens — A rota that names the nights nobody covers
// Wired: GET/POST /api/v1/school/ops/warden-rota, DELETE /ops/warden-rota/{id}; GET /hostels, /directory/staff. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { WardenRota } from "@/features/hostel/Setup";

export const metadata = { title: "SCR-211 · Warden Management · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-211" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/hostel/warden-management?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Assign warden
        </Link>
      </>}>
      <Suspense>
        <WardenRota />
      </Suspense>
    </AppShell>
  );
}
