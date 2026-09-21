// SCR-196 · Boarding / Drop Attendance
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 3 · Stories: US-0391 / US-0392
// Mock: screens/SCR-196_Boarding_Drop_Attendance.html
// Backend: the old frontend served this at /school/transport/trips/[id] — Per-student boarded, dropped, absent
// Wired: GET /api/v1/school/transport/trips/{id} (?id=), POST /trips/{id}/boarding; GET /trips (?on=), /routes/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { BoardingAttendance } from "@/features/transport/Trips";

export const metadata = { title: "SCR-196 · Boarding / Drop Attendance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-196" actions={<button type="submit" form="boarding-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save boarding
        </button>}>
      <Suspense>
        <BoardingAttendance />
      </Suspense>
    </AppShell>
  );
}
