// SCR-209 · Rooms & Beds
// Module: Hostel · Role: Hostel Warden · Release: Phase 2 · Stories: US-0417 / US-0418
// Mock: screens/SCR-209_Rooms_Beds.html
// Backend: the old frontend served this at /school/hostel — Rooms with bed count and occupancy grid
// Wired: GET /api/v1/school/hostels, GET/POST /hostels/{id}/rooms, PATCH /hostels/rooms/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { RoomsBeds } from "@/features/hostel/Setup";

export const metadata = { title: "SCR-209 · Rooms & Beds · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-209" actions={<Link href="/hostel/rooms-beds?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Add room
        </Link>}>
      <Suspense>
        <RoomsBeds />
      </Suspense>
    </AppShell>
  );
}
