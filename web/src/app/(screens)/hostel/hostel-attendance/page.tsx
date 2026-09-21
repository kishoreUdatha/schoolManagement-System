// SCR-212 · Hostel Attendance
// Module: Hostel · Role: Hostel Warden · Release: Phase 3 · Stories: US-0423 / US-0424
// Mock: screens/SCR-212_Hostel_Attendance.html
// Backend: the old frontend served this at /school/hostel — Morning and night roll call
// Wired: GET /api/v1/school/hostels/{id}/residents?on=, POST /hostels/{id}/roll-call. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HostelAttendance } from "@/features/hostel/Daily";

export const metadata = { title: "SCR-212 · Hostel Attendance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-212" actions={<button type="submit" form="roll-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save attendance
        </button>}>
      <Suspense>
        <HostelAttendance />
      </Suspense>
    </AppShell>
  );
}
