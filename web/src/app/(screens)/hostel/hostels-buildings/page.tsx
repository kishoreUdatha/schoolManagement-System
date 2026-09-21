// SCR-208 · Hostels / Buildings
// Module: Hostel · Role: Hostel Warden · Release: Phase 2 · Stories: US-0415 / US-0416
// Mock: screens/SCR-208_Hostels_Buildings.html
// Backend: the old frontend served this at /school/hostel — Hostel cards with kind, warden, fee, curfew
// Wired: GET/POST /api/v1/school/hostels, PUT /hostels/{id}; GET /directory/staff. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HostelList } from "@/features/hostel/Setup";

export const metadata = { title: "SCR-208 · Hostels / Buildings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-208" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/hostel/hostels-buildings?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Add hostel
        </Link>
      </>}>
      <Suspense>
        <HostelList />
      </Suspense>
    </AppShell>
  );
}
